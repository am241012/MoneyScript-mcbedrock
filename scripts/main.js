import { world, system } from "@minecraft/server";

/* =====================
  設定値
===================== */
const MONEY_OBJ = "money";
const ITEM_REWARD = 25; // アイテム報酬
const SOUND_VOLUME = 0.4; // 共通サウンド音量
const TRANSFER_RANGE = 2; // 送金可能な距離

/* =====================
  スコアボード初期化
===================== */
function initScoreboard() {
  const sb = world.scoreboard;
  if (!sb.getObjective(MONEY_OBJ)) {
    sb.addObjective(MONEY_OBJ, "所持金");
    world.sendMessage("§a[System] 所持金スコアボード作成");
  }
}

system.runTimeout(() => {
  initScoreboard();
  world.sendMessage("§e[System] 起動完了！");
}, 20);

/* =====================
  金銭処理
===================== */
function getMoney(player) {
  const obj = world.scoreboard.getObjective(MONEY_OBJ);
  try {
    return obj.getScore(player);
  } catch {
    obj.setScore(player, 0);
    return 0;
  }
}

function addMoney(player, amount) {
  const obj = world.scoreboard.getObjective(MONEY_OBJ);
  obj.addScore(player, amount);

  player.playSound("random.levelup", {
    location: player.location,
    volume: SOUND_VOLUME,
    pitch: 1.0,
  });
}

/* =====================
  所持金UI（アクションバー）
===================== */
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    p.onScreenDisplay.setActionBar(`§6所持金： ${getMoney(p)} G`);
  }
}, 20);

/* =====================
  送金システム
===================== */
system.runInterval(() => {
  for (const giver of world.getAllPlayers()) {
    const inv = giver.getComponent("minecraft:inventory")?.container;
    if (!inv) continue;

    const slot = giver.selectedSlot;
    if (typeof slot !== "number") continue; // ←ここ重要

    const item = inv.getItem(slot);
    if (!item || item.typeId !== "minecraft:stick") continue;

    const name = item.getCustomName();
    const match = name?.match(/^send(\d+)G$/);
    if (!match) continue;

    const amount = Number(match[1]);
    if (isNaN(amount) || amount <= 0) continue;

    if (getMoney(giver) < amount) {
      giver.sendMessage("§c所持金が足りません！");
      continue;
    }

    for (const r of world.getAllPlayers()) {
      if (r === giver) continue;

      const dist = giver.location.distance(r.location);
      if (dist > TRANSFER_RANGE) continue;

      addMoney(r, amount);
      addMoney(giver, -amount);

      giver.sendMessage(`§6${r.name} に ${amount}G 送金しました！`);
      r.sendMessage(`§a${giver.name} から ${amount}G 受け取りました！`);
      break;
    }
  }
}, 20);

/* =====================
  アイテム取得報酬（全アイテム対象・初回のみ）
===================== */
const playerObtainedItems = new Map();

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const invComp = player.getComponent("inventory");
    if (!invComp) continue;

    const inv = invComp.container;

    if (!playerObtainedItems.has(player.id)) {
      playerObtainedItems.set(player.id, new Set());
    }

    const obtained = playerObtainedItems.get(player.id);

    for (let i = 0; i < inv.size; i++) {
      const stack = inv.getItem(i);
      if (!stack) continue;

      const typeId = stack.typeId;

      if (!obtained.has(typeId)) {
        addMoney(player, ITEM_REWARD);

        const displayName = typeId.split(":")[1] ?? typeId;
        player.sendMessage(
          `§a【取得】§f ${displayName} を初めてゲット！ (+${ITEM_REWARD}G)`
        );

        obtained.add(typeId);
      }
    }
  }
}, 20);

/* =====================
  取得種類実績
===================== */
const ITEM_ACHIEVEMENTS = [
  { count: 50, reward: 200 },
  { count: 100, reward: 250 },
  { count: 250, reward: 300 },
  { count: 500, reward: 350 },
  { count: 1000, reward: 400 },
  { count: 1500, reward: 500 },
  { count: 2000, reward: 600 },
  { count: 3000, reward: 700 },
  { count: 4000, reward: 800 },
  { count: 5000, reward: 900 },
];

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const obtained = playerObtainedItems.get(player.id);
    if (!obtained) continue;

    const obtainedCount = obtained.size;

    for (const ach of ITEM_ACHIEVEMENTS) {
      const tag = `achievement_items_${ach.count}`;
      if (obtainedCount >= ach.count && !player.hasTag(tag)) {
        player.addTag(tag);
        addMoney(player, ach.reward);
        player.sendMessage(
          `§b【実績】§f 取得種類 ${ach.count} 達成！ (+${ach.reward}G)`
        );
      }
    }
  }
}, 20);

/* =====================
  モンスターハンター
===================== */
const DEFEATED_ITEMS = [
  "minecraft:rotten_flesh",
  "minecraft:bone",
  "minecraft:arrow",
  "minecraft:gunpowder",
  "minecraft:string",
  "minecraft:spider_eye",
  "minecraft:phantom_membrane",
  "minecraft:totem_of_undying",
  "minecraft:prismarine_shard",
  "minecraft:prismarine_crystals",
];

const firstKillPlayers = new Map();
const FIRST_KILL_REWARD = 300;

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (firstKillPlayers.get(player.id)) continue; // 解除済みスキップ

    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) continue;

    let found = false;
    for (let i = 0; i < inv.size; i++) {
      const item = inv.getItem(i);
      if (!item) continue;

      if (DEFEATED_ITEMS.includes(item.typeId)) {
        found = true;
        break;
      }
    }

    if (!found) continue;

    firstKillPlayers.set(player.id, true);
    addMoney(player, FIRST_KILL_REWARD);

    player.sendMessage("§6【実績解除】§fモンスターハンター");
    player.sendMessage(`§a報酬: +${FIRST_KILL_REWARD}G`);
  }
}, 80);

/* =====================
  本物のモンスターハンター
===================== */
const REAL_HUNTER_ACH_ID = "achievement_real_monster_hunter";
const DEFEATED_REWARD = 500;

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (player.getDynamicProperty(REAL_HUNTER_ACH_ID)) continue;

    const inv = player.getComponent("inventory")?.container;
    if (!inv) continue;

    const items = new Set();
    for (let i = 0; i < inv.size; i++) {
      const slot = inv.getItem(i);
      if (slot) items.add(slot.typeId);
    }

    const completed = DEFEATED_ITEMS.every((id) => items.has(id));
    if (!completed) continue;

    player.setDynamicProperty(REAL_HUNTER_ACH_ID, true);
    addMoney(player, DEFEATED_REWARD);

    player.sendMessage("§d【実績解除】§f本物のモンスターハンター");
    player.sendMessage(`§a報酬: +${DEFEATED_REWARD}G`);
  }
}, 100);

/* =====================
  ☑ 石だらけのインベントリ
   ===================== */
const STONE_INV_ACH_ID = "achievement_stone_inventory";
const STONE_ITEMS = ["minecraft:cobblestone", "minecraft:cobbled_deepslate"];
const STONE_REWARD = 300;

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (player.getDynamicProperty(STONE_INV_ACH_ID)) continue;

    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) continue;

    let completed = true;

    for (let slot = 9; slot <= 35; slot++) {
      const item = inv.getItem(slot);

      if (!item || !STONE_ITEMS.includes(item.typeId)) {
        completed = false;
        break;
      }
    }

    if (!completed) continue;

    player.setDynamicProperty(STONE_INV_ACH_ID, true);
    addMoney(player, STONE_REWARD);

    player.sendMessage("§6【実績】§f石だらけのインベントリ");
    player.sendMessage(`§a報酬: ${STONE_REWARD}G`);
  }
}, 100);

/* =====================
  ☑ 古代石だらけのインベントリ 
===================== */
const ANCSTONE_ACH_ID = "achievement_ancient_stone_inventory";
const ANCSTONE_ITEMS = ["minecraft:cobbled_deepslate"];
const ANCSTONE_REWARD = 500;

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (player.getDynamicProperty(ANCSTONE_ACH_ID)) continue;

    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) continue;

    let completed = true;

    for (let slot = 9; slot <= 35; slot++) {
      const item = inv.getItem(slot);
      if (!item || !ANCSTONE_ITEMS.includes(item.typeId)) {
        completed = false;
        break;
      }
    }

    if (!completed) continue;

    player.setDynamicProperty(ANCSTONE_ACH_ID, true);
    addMoney(player, ANCSTONE_REWARD);

    player.sendMessage("§d【実績】§f古代石だらけのインベントリ");
    player.sendMessage(`§a報酬: ${ANCSTONE_REWARD}G`);
  }
}, 100);
