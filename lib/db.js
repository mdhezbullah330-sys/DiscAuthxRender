import { MongoClient } from 'mongodb';
import { required } from './config';

let clientPromise;
let dbPromise;

async function getDb() {
  if (!clientPromise) {
    const client = new MongoClient(required('MONGODB_URI'), {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10000,
    });
    clientPromise = client.connect();
  }

  if (!dbPromise) {
    dbPromise = clientPromise.then(async (client) => {
      const db = client.db(required('MONGODB_DB_NAME'));
      const users = db.collection('oauth_users');
      await users.createIndex({ discord_id: 1 }, { unique: true });
      await users.createIndex({ status: 1, expires_at: 1 });
      await users.createIndex({ authorized_guilds: 1 });
      return db;
    });
  }

  return dbPromise;
}

export async function getUser(discordId) {
  const db = await getDb();
  return db.collection('oauth_users').findOne({ discord_id: String(discordId) });
}

export async function listUsers() {
  const db = await getDb();
  return db.collection('oauth_users').find({}).sort({ updated_at: -1 }).toArray();
}

export async function upsertOAuthUser(user, token) {
  const { encrypt } = await import('./crypto');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(token.expires_in || 0) * 1000);
  const db = await getDb();
  const collection = db.collection('oauth_users');

  const result = await collection.findOneAndUpdate(
    { discord_id: String(user.id) },
    {
      $set: {
        discord_id: String(user.id),
        username: user.username || null,
        global_name: user.global_name || null,
        nickname: user.nickname || null,
        avatar: user.avatar || null,
        access_token_enc: encrypt(token.access_token),
        refresh_token_enc: encrypt(token.refresh_token),
        expires_at: expiresAt,
        scope: token.scope || '',
        status: 'active',
        last_seen_at: now,
        updated_at: now,
      },
      $setOnInsert: {
        authorized_guilds: [],
        created_at: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  return result;
}

export async function addAuthorizedGuild(discordId, guildId) {
  const db = await getDb();
  const now = new Date();
  return db.collection('oauth_users').findOneAndUpdate(
    { discord_id: String(discordId) },
    {
      $addToSet: { authorized_guilds: String(guildId) },
      $set: { status: 'active', updated_at: now, last_seen_at: now },
    },
    { returnDocument: 'after' }
  );
}

export async function clearAuthorizedGuilds(discordId) {
  const db = await getDb();
  return db.collection('oauth_users').findOneAndUpdate(
    { discord_id: String(discordId) },
    { $set: { authorized_guilds: [], updated_at: new Date() } },
    { returnDocument: 'after' }
  );
}

export async function updateTokens(discordId, token) {
  const { encrypt } = await import('./crypto');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(token.expires_in || 0) * 1000);
  const db = await getDb();

  return db.collection('oauth_users').findOneAndUpdate(
    { discord_id: String(discordId) },
    {
      $set: {
        access_token_enc: encrypt(token.access_token),
        refresh_token_enc: encrypt(token.refresh_token),
        expires_at: expiresAt,
        status: 'active',
        last_refresh_at: now,
        updated_at: now,
      },
    },
    { returnDocument: 'after' }
  );
}

export async function setStatus(discordId, status) {
  const db = await getDb();
  const now = new Date();
  return db.collection('oauth_users').findOneAndUpdate(
    { discord_id: String(discordId) },
    {
      $set: {
        status,
        updated_at: now,
        ...(status === 'reauth_required' ? { revoked_at: now } : {}),
      },
    },
    { returnDocument: 'after' }
  );
}

export async function listRefreshCandidates() {
  const db = await getDb();
  const dueAt = new Date(Date.now() + 30 * 60 * 60 * 1000);

  return db.collection('oauth_users').find({
    refresh_token_enc: { $exists: true, $ne: null },
    $or: [
      { expires_at: { $exists: false } },
      { expires_at: null },
      { expires_at: { $lte: dueAt } },
    ],
    status: { $in: ['active', 'expired'] },
  }).sort({ expires_at: 1 }).toArray();
}

export async function listActiveUsers() {
  const db = await getDb();
  return db.collection('oauth_users').find({ status: 'active' }).toArray();
}
