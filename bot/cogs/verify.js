const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
} = require('discord.js');
const axios = require('axios');
const { getConfig, saveConfig } = require('../utils/configManager');
const VerifyLog = require('../models/verifyLog');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const VERIFY_ROLE_ID = '1436054335220875284';
const VERIFY_GUILD_ID_1 = '1435304112877998131';
const VERIFY_ROLE_ID_2 = '1542721497091538970';
const VERIFY_GUILD_ID_2 = '1535164246852374550';
const VERIFY_WEB_URL = 'https://auth.benjahex.qzz.io';
const OAUTH_ROLE_SYNC_INTERVAL_MS = 30_000;
const VERIFY_IMAGE_URL = 'https://files.catbox.moe/tuwj6y.webp';
const VERIFY_IMAGE_FILENAME = 'verify-banner.webp';
const VERIFY_LOG_IMAGE_URL = 'https://files.catbox.moe/qkgp7u.jpg';
const VERIFY_LOG_IMAGE_FILENAME = 'verify-log-banner.jpg';
const VERIFY_BUTTON_ID = 'verify_panel_button';

const SET_CHANNEL_BUTTON_ID = 'logpanelx_set_channel';
const UNVERIFIED_LIST_BUTTON_ID = 'logpanelx_unverified_list';
const AUTO_VERIFY_BUTTON_ID = 'logpanelx_auto_verify';
const CHANNEL_MODAL_ID = 'logpanelx_channel_modal';
const CHANNEL_MODAL_INPUT_ID = 'logpanelx_channel_input';

const PANEL_REFRESH_INTERVAL_MS = 30_000;

// ─────────────────────────────────────────────
//  OAUTH / ROLE SYNC
// ─────────────────────────────────────────────
function getVerifyRoleId(guildId) {
  if (guildId === VERIFY_GUILD_ID_2) return VERIFY_ROLE_ID_2;
  return VERIFY_ROLE_ID;
}

function getVerifyOAuthUrl(guildId) {
  return `${VERIFY_WEB_URL}/api/auth/discord?guildId=${encodeURIComponent(guildId)}`;
}

function getOAuthCollection() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
  return mongoose.connection.db.collection('oauth_users');
}

function isOAuthRecordAuthorizedForGuild(record, guildId) {
  if (!record || record.status !== 'active') return false;

  if (Array.isArray(record.authorized_guilds)) {
    return record.authorized_guilds.map(String).includes(String(guildId));
  }

  if (record.guild_id) {
    return String(record.guild_id) === String(guildId);
  }

  // Missing per-server authorization metadata is treated as unauthorized
  // during migration rather than granting a role to both servers.
  return false;
}

async function loadOAuthRecords() {
  const collection = getOAuthCollection();
  if (!collection) return null;

  return collection.find(
    { status: 'active' },
    { projection: { discord_id: 1, authorized_guilds: 1, guild_id: 1 } }
  ).toArray();
}

let oauthRoleSyncRunning = false;

async function syncOAuthRoles(client) {
  if (oauthRoleSyncRunning) {
    return { skipped: true, added: 0, removed: 0 };
  }

  const collection = getOAuthCollection();

  // Fail safe: MongoDB down must NEVER mass-remove roles.
  if (!collection) {
    return { skipped: true, added: 0, removed: 0, reason: 'mongodb_unavailable' };
  }

  oauthRoleSyncRunning = true;

  let added = 0;
  let removed = 0;

  try {
    const records = await loadOAuthRecords();

    if (!records) {
      return { skipped: true, added: 0, removed: 0, reason: 'mongodb_unavailable' };
    }

    for (const guildId of [VERIFY_GUILD_ID_1, VERIFY_GUILD_ID_2]) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      const roleId = getVerifyRoleId(guildId);
      const role = await guild.roles.fetch(roleId).catch(() => null);

      if (!role) {
        console.error(`[✗] Verify role ${roleId} was not found in guild ${guildId}.`);
        continue;
      }

      const authorizedIds = new Set(
        records
          .filter(record => isOAuthRecordAuthorizedForGuild(record, guildId))
          .map(record => String(record.discord_id))
          .filter(Boolean)
      );

      // Remove role from every currently-cached member who is no longer authorized.
      for (const member of role.members.values()) {
        if (authorizedIds.has(String(member.id))) continue;

        try {
          await member.roles.remove(
            roleId,
            'OAuth authorization is not active'
          );
          removed++;
        } catch (err) {
          console.error(
            `[✗] Failed to remove verify role from ${member.id} in ${guildId}:`,
            err.message
          );
        }
      }

      // Add the role to authorized members already present in the guild cache.
      // GuildMemberAdd below handles authorized users who join afterwards.
      for (const member of guild.members.cache.values()) {
        if (member.user?.bot) continue;
        if (!authorizedIds.has(String(member.id))) continue;
        if (member.roles.cache.has(roleId)) continue;

        try {
          await member.roles.add(
            roleId,
            'OAuth authorization is active'
          );

          VerifyLog.create({
            guildId,
            userId: member.id,
          }).catch(() => {});

          added++;
        } catch (err) {
          console.error(
            `[✗] Failed to add verify role to ${member.id} in ${guildId}:`,
            err.message
          );
        }
      }
    }

    return { skipped: false, added, removed };

  } catch (err) {
    console.error('[✗] OAuth role sync failed:', err);
    return {
      skipped: true,
      added,
      removed,
      reason: err.message,
    };
  } finally {
    oauthRoleSyncRunning = false;
  }
}

function startOAuthRoleSync(client) {
  // First sync after startup.
  setTimeout(() => {
    syncOAuthRoles(client).catch(err => {
      console.error('[✗] Initial OAuth role sync error:', err);
    });
  }, 10_000);

  // Continue checking every 30 seconds.
  setInterval(() => {
    syncOAuthRoles(client).catch(err => {
      console.error('[✗] Scheduled OAuth role sync error:', err);
    });
  }, OAUTH_ROLE_SYNC_INTERVAL_MS);
}

async function syncSingleMemberOAuthRole(member) {
  if (!member || !member.guild || member.user?.bot) return;

  if (![VERIFY_GUILD_ID_1, VERIFY_GUILD_ID_2].includes(member.guild.id)) {
    return;
  }

  const collection = getOAuthCollection();
  if (!collection) return;

  const record = await collection.findOne(
    { discord_id: String(member.id) },
    { projection: { status: 1, authorized_guilds: 1, guild_id: 1 } }
  ).catch(() => null);

  // Fail safe if the DB query itself failed.
  if (record === null) return;

  const roleId = getVerifyRoleId(member.guild.id);
  const authorized = isOAuthRecordAuthorizedForGuild(
    record,
    member.guild.id
  );

  try {
    if (authorized) {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(
          roleId,
          'OAuth authorization is active'
        );

        VerifyLog.create({
          guildId: member.guild.id,
          userId: member.id,
        }).catch(() => {});
      }
    } else if (member.roles.cache.has(roleId)) {
      await member.roles.remove(
        roleId,
        'OAuth authorization is not active'
      );
    }
  } catch (err) {
    console.error(
      `[✗] Failed to sync verify role for ${member.id}:`,
      err.message
    );
  }
}

// NOTE: The panels below use Discord's "Components V2" (ContainerBuilder,
// TextDisplayBuilder, SectionBuilder, SeparatorBuilder, MediaGalleryBuilder,
// ActionRowBuilder inside a container). Requires discord.js v14.16+.

// ─────────────────────────────────────────────
//  IMAGE ATTACHMENT CACHE
//  Discord's own CDN is far more reliable than referencing a third-party
//  URL directly in a MediaGalleryItemBuilder — external hosts (catbox etc.)
//  sometimes rate-limit or block Discord's fetch crawler, which shows up
//  as "Image failed to load" for users even though the link works fine in
//  a normal browser. Fetching once and re-using it as a native attachment
//  (attachment://filename) sidesteps that entirely.
// ─────────────────────────────────────────────
const imageAttachmentCache = new Map();

async function getImageAttachment(url, filename) {
  if (imageAttachmentCache.has(url)) return imageAttachmentCache.get(url);

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const result = { attachment: Buffer.from(response.data), name: filename };
    imageAttachmentCache.set(url, result);
    return result;
  } catch (err) {
    console.error(`[✗] Failed to fetch image for attachment (${url}):`, err.message);
    return null; // caller falls back to the raw external URL
  }
}

// ─────────────────────────────────────────────
//  SLASH COMMAND DATA
// ─────────────────────────────────────────────
const slashCommandsData = [
  new SlashCommandBuilder()
    .setName('sendverifypanel')
    .setDescription('Send the verification panel to this channel (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('logcontrolpanel')
    .setDescription('Send the verification management panel (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

// ─────────────────────────────────────────────
//  PERMISSION HELPER
// ─────────────────────────────────────────────
function isAdminOrOwner(member, guild) {
  if (!member || !guild) return false;
  if (guild.ownerId === member.id) return true;
  return member.permissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

// ─────────────────────────────────────────────
//  DISCORD TIMESTAMP HELPER
// ─────────────────────────────────────────────
function fullTimestamp(date) {
  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

// ─────────────────────────────────────────────
//  MEMBER HELPERS
// ─────────────────────────────────────────────
async function ensureMembersCached(guild) {
  // Avoid re-requesting the full member list (gateway opcode 8) every time —
  // that's what was triggering GatewayRateLimitError. Only fetch if the
  // cache is actually missing members, and never let a failed fetch crash
  // the caller — just fall back to whatever is cached.
  if (guild.members.cache.size < guild.memberCount) {
    try {
      await guild.members.fetch();
    } catch (err) {
      console.error('[✗] Member fetch skipped (rate limited or failed), using cache:', err.message);
    }
  }
  return guild.members.cache;
}

function isUnverifiedMember(member) {
  // "Unverified" = no roles other than @everyone, excluding bots
  return !member.user.bot && member.roles.cache.size === 1;
}

async function getUnverifiedMembers(guild) {
  const members = await ensureMembersCached(guild);
  return [...members.filter(isUnverifiedMember).values()];
}

async function getPanelStats(guild) {
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  const members = await ensureMembersCached(guild);

  const joinedLast24h = members.filter(
    m => m.joinedAt && m.joinedAt.getTime() >= sinceMs
  ).size;

  const verifiedLast24h = await VerifyLog.countDocuments({
    guildId: guild.id,
    verifiedAt: { $gte: new Date(sinceMs) },
  });

  const totalUnverified = members.filter(isUnverifiedMember).size;

  return { joinedLast24h, verifiedLast24h, totalUnverified };
}

// ─────────────────────────────────────────────
//  BUILD THE VERIFY PANEL (Components V2)
//  imageSource: either the external URL (fallback) or "attachment://filename"
// ─────────────────────────────────────────────
function buildVerifyPanel(imageSource, guildId) {
  const container = new ContainerBuilder().setAccentColor(0xFF0000); // red border

  // Top image
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(imageSource)
    )
  );

  // Big heading
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## <:1hai:1538570002410774539> . 花 . ᕫᴣ、Verify To Enter . ≧。 . ıl'
    )
  );

  // Decorative separator line
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("○ . ⌣⌣⌣ . ཻುଓ' . ⌣⌣⌣ . ○")
  );

  // Info line + Verify button on the right (Section w/ button accessory)
  const verifyButton = new ButtonBuilder()
    .setLabel('Verify')
    .setEmoji('✅')
    .setStyle(ButtonStyle.Link)
    .setURL(getVerifyOAuthUrl(guildId));

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "⑧ . 苑 . 33 : You've joined with no roles and can't see the server yet."
        )
      )
      .setButtonAccessory(verifyButton)
  );

  // Instruction line
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '♡ Press Verify below to unlock full access to BENJA HEX. . ᙏ . ‹3'
    )
  );

  // Separator component
  container.addSeparatorComponents(new SeparatorBuilder());

  // Small footer note with emoji
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "-# <a:forzeaim:1482741888862912562> Verify within 2 days of joining or you'll be removed ☾"
    )
  );

  return container;
}

async function sendVerifyPanel(channel) {
  const img = await getImageAttachment(VERIFY_IMAGE_URL, VERIFY_IMAGE_FILENAME);
  const imageSource = img ? `attachment://${img.name}` : VERIFY_IMAGE_URL;

  const payload = {
    components: [buildVerifyPanel(imageSource, channel.guild?.id)],
    flags: MessageFlags.IsComponentsV2,
  };
  if (img) payload.files = [img];

  return channel.send(payload);
}

// ─────────────────────────────────────────────
//  BUILD THE VERIFY LOG CONTAINER (Components V2)
// ─────────────────────────────────────────────
function buildVerifyLogContainer(member, now, joinedAt) {
  const container = new ContainerBuilder().setAccentColor(0xF2C6D4); // soft pink border

  // Heading
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## . 花 . ᨳ᭄⃟ Verification 𝙲omplete ! . ≧౨ৎ . ıl'
    )
  );

  // Decorative divider (distinct from panel's divider)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("𖥸 . ⌣⌣⌣ . ⳹ৎ𖤐 . ⌣⌣⌣ . 𖥸")
  );

  // Separator before fields
  container.addSeparatorComponents(new SeparatorBuilder());

  // Fields — each with its own distinct decorative style
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`᰻⃟ৎ . 𝚄sername ⌇ ${member.user.tag}`)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`⋆ . 𝙸D ⳹ৎ ${member.id}`)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`ᯓ★ . Verified 𝙰t ⌇ ${fullTimestamp(now)}`)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`. ᨳ⃝ Joined 𝚂erver ৎ⌇ ${fullTimestamp(joinedAt)}`)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`❀⃟ . 𝚁ole 𝙶iven ⌇ <@&${getVerifyRoleId(member.guild?.id || '')}>`)
  );

  return container;
}

async function sendVerifyLog(guild, member) {
  try {
    const cfg = await getConfig();
    if (!cfg.verifyLogChannel) return;

    const logChannel = await guild.channels.fetch(cfg.verifyLogChannel).catch(() => null);
    if (!logChannel) return;

    const now = new Date();
    const joinedAt = member.joinedAt || now;

    await logChannel.send({
      components: [buildVerifyLogContainer(member, now, joinedAt)],
      flags: MessageFlags.IsComponentsV2,
    });

  } catch (err) {
    console.error('[✗] Failed to send verify log:', err);
  }
}

// ─────────────────────────────────────────────
//  BUILD THE LOG CONTROL PANEL (Components V2)
//  imageSource: either the external URL (fallback) or "attachment://filename"
// ─────────────────────────────────────────────
async function buildLogControlPanel(guild, cfg, imageSource) {
  const stats = await getPanelStats(guild);
  const container = new ContainerBuilder();

  // Top image
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(imageSource)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Heading
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## . 花 . ᜊ᭄⃟ Verification 𝙼anagement . ≧౨ৎ . ıl'
    )
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("⳹ . ⌣⌣⌣ . ৎ𖥔ৎ . ⌣⌣⌣ . ⳹")
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Log channel info
  const logChannelLine = cfg.verifyLogChannel
    ? `᰻⃟ৎ . 𝙻og 𝙲hannel ⌇ <#${cfg.verifyLogChannel}>`
    : `᰻⃟ৎ . 𝙻og 𝙲hannel ⌇ Not set`;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(logChannelLine));

  if (cfg.verifyLogChannel && cfg.verifyLogChannelSetBy) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`⋆ . Added 𝙱y ⳹ৎ <@${cfg.verifyLogChannelSetBy}>`)
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());

  // Last 24 hours stats
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('ᯓ★ . 𝙻ast 24 𝙷ours')
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`. ᨳ⃝ 𝙹oined ৎ⌇ ${stats.joinedLast24h} member(s)`)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`❀⃟ . Verified ⌇ ${stats.verifiedLast24h} member(s)`)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Total unverified
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`✧ . 𝚃otal 𝚄nverified ⌇ ${stats.totalUnverified} member(s)`)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Buttons
  const setChannelButton = new ButtonBuilder()
    .setCustomId(SET_CHANNEL_BUTTON_ID)
    .setLabel('𝐂𝐡𝐚𝐧𝐧𝐞𝐥 𝐒𝐞𝐭')
    .setStyle(ButtonStyle.Primary);

  const unverifiedListButton = new ButtonBuilder()
    .setCustomId(UNVERIFIED_LIST_BUTTON_ID)
    .setLabel('𝐔𝐧𝐯𝐞𝐫𝐢𝐟𝐢𝐞𝐝 𝐋𝐢𝐬𝐭')
    .setStyle(ButtonStyle.Secondary);

  const autoVerifyButton = new ButtonBuilder()
    .setCustomId(AUTO_VERIFY_BUTTON_ID)
    .setLabel('𝐎𝐀𝐮𝐭𝐡 𝐑𝐨𝐥𝐞 𝐒𝐲𝐧𝐜')
    .setStyle(ButtonStyle.Success);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(setChannelButton, unverifiedListButton, autoVerifyButton)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Auto-refreshes every 30 seconds')
  );

  return container;
}

// ─────────────────────────────────────────────
//  REFRESH THE STORED LOG CONTROL PANEL MESSAGE
// ─────────────────────────────────────────────
async function refreshLogControlPanel(client, guild) {
  try {
    const cfg = await getConfig();
    if (!cfg.logPanelChannelId || !cfg.logPanelMessageId) return;

    const channel = await client.channels.fetch(cfg.logPanelChannelId).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(cfg.logPanelMessageId).catch(() => null);
    if (!message) return;

    // The message already carries the original attachment from when it was
    // first sent — reference the same filename, no need to re-fetch/re-upload.
    const imageSource = `attachment://${VERIFY_LOG_IMAGE_FILENAME}`;
    const container = await buildLogControlPanel(guild, cfg, imageSource);
    await message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });

  } catch (err) {
    // 50005 = "Cannot edit a message authored by another user" (stale message
    //          from a different bot instance/token).
    // 50035 = "Invalid Form Body" — specifically happens when the stored
    //          message predates this fix and has no attachment named
    //          verify-log-banner.jpg to reference. Either way the stored
    //          reference is unusable; clear it instead of retrying forever.
    if (err.code === 50005 || err.code === 50035) {
      console.error(`[✗] Stored log control panel is stale (code ${err.code}) — clearing reference. Re-run /logcontrolpanel to recreate it.`);
      try {
        const cfg = await getConfig();
        cfg.logPanelChannelId = null;
        cfg.logPanelMessageId = null;
        cfg.markModified && cfg.markModified('logPanelChannelId');
        cfg.markModified && cfg.markModified('logPanelMessageId');
        await saveConfig(cfg);
      } catch (clearErr) {
        console.error('[✗] Failed to clear stale log panel reference:', clearErr.message);
      }
      return;
    }
    console.error('[✗] Failed to refresh log control panel:', err);
  }
}

// ─────────────────────────────────────────────
//  AUTO-REFRESH LOOP (survives restarts — starts fresh on every boot)
// ─────────────────────────────────────────────
function startPanelAutoRefresh(client) {
  setInterval(async () => {
    try {
      const cfg = await getConfig();
      if (!cfg.guildId) return;
      const guild = await client.guilds.fetch(cfg.guildId).catch(() => null);
      if (!guild) return;
      await refreshLogControlPanel(client, guild);
    } catch (err) {
      console.error('[✗] Panel auto-refresh error:', err);
    }
  }, PANEL_REFRESH_INTERVAL_MS);
}

// ─────────────────────────────────────────────
//  PREFIX COMMAND: !sendverifypanel
// ─────────────────────────────────────────────
async function executePrefix(message) {
  if (!isAdminOrOwner(message.member, message.guild)) {
    return message.reply('✗ You need Administrator permission.')
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  await message.delete().catch(() => {});
  await sendVerifyPanel(message.channel).catch(err => {
    console.error('[✗] Failed to send verify panel:', err);
  });
}

// ─────────────────────────────────────────────
//  SLASH COMMAND HANDLER: /sendverifypanel
// ─────────────────────────────────────────────
async function handleSlashCommand(interaction) {
  if (!isAdminOrOwner(interaction.member, interaction.guild)) {
    return interaction.reply({
      content: '✗ You need Administrator permission.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Ack within Discord's 3s window BEFORE the (potentially slow) image
  // fetch inside sendVerifyPanel — otherwise the interaction token can
  // expire while we're still downloading the banner, causing a
  // confusing "Unknown interaction" (10062) error on the final reply.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await sendVerifyPanel(interaction.channel).catch(err => {
    console.error('[✗] Failed to send verify panel:', err);
  });

  return interaction.editReply({ content: '✓ Verify panel sent.' });
}

// ─────────────────────────────────────────────
//  SLASH COMMAND HANDLER: /logcontrolpanel
// ─────────────────────────────────────────────
async function handleLogControlPanelCommand(interaction) {
  if (!isAdminOrOwner(interaction.member, interaction.guild)) {
    return interaction.reply({
      content: '✗ You need Administrator permission.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const cfg = await getConfig();

    const img = await getImageAttachment(VERIFY_LOG_IMAGE_URL, VERIFY_LOG_IMAGE_FILENAME);
    const imageSource = img ? `attachment://${img.name}` : VERIFY_LOG_IMAGE_URL;
    const container = await buildLogControlPanel(interaction.guild, cfg, imageSource);

    const panelPayload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    if (img) panelPayload.files = [img];

    const panelMsg = await interaction.channel.send(panelPayload);

    cfg.logPanelChannelId = interaction.channel.id;
    cfg.logPanelMessageId = panelMsg.id;
    if (!cfg.guildId) cfg.guildId = interaction.guild.id;
    cfg.markModified && cfg.markModified('logPanelChannelId');
    cfg.markModified && cfg.markModified('logPanelMessageId');
    await saveConfig(cfg);

    await interaction.editReply({ content: '✓ Verification management panel sent.' });

  } catch (err) {
    console.error('[✗] Failed to send log control panel:', err);
    await interaction.editReply({ content: '✗ Something went wrong while sending the panel.' });
  }
}

// ─────────────────────────────────────────────
//  BUTTON: Channel Set → open modal
// ─────────────────────────────────────────────
async function handleSetChannelButton(interaction) {
  if (!isAdminOrOwner(interaction.member, interaction.guild)) {
    return interaction.reply({
      content: '✗ You need Administrator permission.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(CHANNEL_MODAL_ID)
    .setTitle('Set Verify Log Channel');

  const input = new TextInputBuilder()
    .setCustomId(CHANNEL_MODAL_INPUT_ID)
    .setLabel('Channel ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter the log channel ID')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
}

// ─────────────────────────────────────────────
//  MODAL SUBMIT: channel ID → save + edit panel message
// ─────────────────────────────────────────────
async function handleChannelModalSubmit(interaction) {
  const channelId = interaction.fields.getTextInputValue(CHANNEL_MODAL_INPUT_ID).trim();
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    return interaction.reply({
      content: '✗ Invalid channel ID. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const cfg = await getConfig();
    cfg.verifyLogChannel = channel.id;
    cfg.verifyLogChannelSetBy = interaction.user.id;
    if (!cfg.guildId) cfg.guildId = interaction.guild.id;
    cfg.markModified && cfg.markModified('verifyLogChannel');
    cfg.markModified && cfg.markModified('verifyLogChannelSetBy');
    await saveConfig(cfg);
  } catch (err) {
    console.error('[✗] Failed to save log channel:', err);
    return interaction.reply({
      content: '✗ Something went wrong while saving the log channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    content: `✦ Log channel set to <#${channel.id}>`,
    flags: MessageFlags.Ephemeral,
  });

  await refreshLogControlPanel(interaction.client, interaction.guild);
}

// ─────────────────────────────────────────────
//  BUTTON: Unverified List
// ─────────────────────────────────────────────
async function handleUnverifiedListButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const members = await getUnverifiedMembers(interaction.guild);

    if (members.length === 0) {
      return interaction.editReply({ content: '✦ No unverified members found.' });
    }

    const shown = members.slice(0, 40);
    const lines = shown.map(m => `➤ ${m.user.tag} ⌇ ${m.id}`);
    let content = `᰻⃟ৎ . Unverified Members (${members.length})\n\n${lines.join('\n')}`;

    if (members.length > shown.length) {
      content += `\n\n-# ...and ${members.length - shown.length} more`;
    }

    if (content.length > 1900) {
      content = `${content.slice(0, 1900)}\n-# (list truncated)`;
    }

    await interaction.editReply({ content });

  } catch (err) {
    console.error('[✗] Failed to fetch unverified list:', err);
    await interaction.editReply({ content: '✗ Something went wrong while fetching the list.' });
  }
}

// ─────────────────────────────────────────────
//  BUTTON: Auto Verify
// ─────────────────────────────────────────────
async function handleAutoVerifyButton(interaction) {
  if (!isAdminOrOwner(interaction.member, interaction.guild)) {
    return interaction.reply({
      content: '✗ You need Administrator permission.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await syncOAuthRoles(interaction.client);

    if (result.skipped && result.reason === 'mongodb_unavailable') {
      return interaction.editReply({
        content: '✗ OAuth role sync is unavailable because MongoDB is not ready.',
      });
    }

    await interaction.editReply({
      content: `✧ OAuth role sync complete ⌇ Added: ${result.added} ⌇ Removed: ${result.removed}`,
    });

    await refreshLogControlPanel(
      interaction.client,
      interaction.guild
    );
  } catch (err) {
    console.error('[✗] Failed to sync OAuth roles:', err);
    await interaction.editReply({
      content: '✗ Something went wrong during OAuth role sync.',
    });
  }
}

// ─────────────────────────────────────────────
//  VERIFY BUTTON HANDLER
// ─────────────────────────────────────────────
async function handleVerifyButton(interaction) {
  const { guild } = interaction;
  const oauthUrl = getVerifyOAuthUrl(guild.id);

  const verifyLink = new ButtonBuilder()
    .setLabel('Authorize with Discord')
    .setStyle(ButtonStyle.Link)
    .setURL(oauthUrl);

  return interaction.reply({
    content: 'Please authorize with Discord to continue verification.',
    components: [
      new ActionRowBuilder().addComponents(verifyLink),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

// ─────────────────────────────────────────────
//  COG ENTRYPOINT
// ─────────────────────────────────────────────
function verifyCog(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'sendverifypanel') {
        return await handleSlashCommand(interaction);
      }

      if (interaction.isChatInputCommand() && interaction.commandName === 'logcontrolpanel') {
        return await handleLogControlPanelCommand(interaction);
      }

      if (interaction.isButton() && interaction.customId === VERIFY_BUTTON_ID) {
        return await handleVerifyButton(interaction);
      }

      if (interaction.isButton() && interaction.customId === SET_CHANNEL_BUTTON_ID) {
        return await handleSetChannelButton(interaction);
      }

      if (interaction.isButton() && interaction.customId === UNVERIFIED_LIST_BUTTON_ID) {
        return await handleUnverifiedListButton(interaction);
      }

      if (interaction.isButton() && interaction.customId === AUTO_VERIFY_BUTTON_ID) {
        return await handleAutoVerifyButton(interaction);
      }

      if (interaction.isModalSubmit() && interaction.customId === CHANNEL_MODAL_ID) {
        return await handleChannelModalSubmit(interaction);
      }
    } catch (err) {
      console.error('[✗] verify cog interaction error:', err);
    }
  });

  startPanelAutoRefresh(client);
  startOAuthRoleSync(client);

  client.on(Events.GuildMemberAdd, async member => {
    try {
      await syncSingleMemberOAuthRole(member);
    } catch (err) {
      console.error('[✗] GuildMemberAdd OAuth role sync error:', err);
    }
  });
}

verifyCog.slashCommandsData = slashCommandsData;
verifyCog.executePrefix = executePrefix;

module.exports = verifyCog;