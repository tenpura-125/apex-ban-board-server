const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

// 💡 サーバー全体の稼働状況をきれいに表示する補助関数
function printServerStatus() {
    console.log("\n====== 📊 現在のサーバー稼働状況 ======");
    const roomIds = Object.keys(rooms);
    
    if (roomIds.length === 0) {
        console.log("稼働中の部屋: なし (メモリは完全にクリーンです)");
    } else {
        roomIds.forEach(id => {
            // この部屋に現在繋がっている人数をカウント
            let count = 0;
            wss.clients.forEach(client => {
                if (client.currentRoomId === id && client.readyState === WebSocket.OPEN) {
                    count++;
                }
            });
            console.log(`🏠 部屋 [${id}] | パスワード: [${rooms[id].password}] | 現在の滞在人数: ${count}人 | BAN数: ${rooms[id].bannedLegends.length}つ`);
        });
    }
    console.log("=======================================\n");
}

wss.on('connection', function connection(ws) {
    ws.currentRoomId = null;
    console.log("🟢 新しいプレイヤーがサイト（またはDiscord）を開きました。");

    ws.on('message', function incoming(message) {
        const data = JSON.parse(message);

        // 【機能1】新しい部屋を作る
        if (data.type === "CREATE_ROOM") {
            let roomId;
            do {
                roomId = Math.floor(1000 + Math.random() * 9000).toString();
            } while (rooms[roomId]);

            const password = Math.floor(1000 + Math.random() * 9000).toString();

            rooms[roomId] = {
                password: password,
                bannedLegends: []
            };

            ws.currentRoomId = roomId;
            console.log(`✨ [部屋作成] 部屋 ${roomId} が新しく作られました。`);
            ws.send(JSON.stringify({ type: "ROOM_CREATED", roomId: roomId, password: password }));
            
            // 状況を表示
            printServerStatus();
        }

        // 【機能2】既存の部屋に入る
        if (data.type === "JOIN_ROOM") {
            const { roomId, password } = data;

            if (!rooms[roomId]) {
                console.log(`❌ [入室失敗] 存在しない部屋番号 ${roomId} へのアクセスがありました。`);
                return ws.send(JSON.stringify({ type: "ERROR", message: "指定された部屋番号が見つかりません" }));
            }

            const isMaster = (rooms[roomId].password === password);
            ws.currentRoomId = roomId;

            console.log(`📥 [入室成功] 部屋 ${roomId} にプレイヤーが参加しました。権限: ${isMaster ? 'マスター' : '観戦者'}`);
            ws.send(JSON.stringify({ 
                type: "ROOM_JOINED", 
                roomId: roomId, 
                isMaster: isMaster,
                inputPassword: password,
                bannedLegends: rooms[roomId].bannedLegends 
            }));

            // 状況を表示
            printServerStatus();
        }

        // 【機能3】キャラクターのクリック同期
        if (data.type === "TOGGLE_BAN") {
            const { roomId, password, legendAlt } = data;
            const room = rooms[roomId];
            if (!room || room.password !== password) return;

            const index = room.bannedLegends.findIndex(item => item.alt === legendAlt);
            if (index !== -1) {
                room.bannedLegends.splice(index, 1);
                console.log(`🔄 [BAN解除] 部屋 ${roomId} で ${legendAlt} が解除されました。`);
            } else {
                let imgName = legendAlt;
                if (legendAlt === "ブラハ") imgName = "ブラッドハウンド";
                if (legendAlt === "ヴァルキリ―") imgName = "ヴァルキリー";
                if (legendAlt === "ジブ") imgName = "ジブラルタル";
                room.bannedLegends.push({ src: `${imgName}.png`, alt: legendAlt });
                console.log(`📌 [BAN追加] 部屋 ${roomId} で ${legendAlt} がBANされました。`);
            }
            broadcastToRoom(roomId, { type: "UPDATE_BAN_STATE", bannedLegends: room.bannedLegends });
        }

        // 【機能4】一括リセット同期
        if (data.type === "RESET_BANS") {
            const { roomId, password } = data;
            const room = rooms[roomId];
            if (!room || room.password !== password) return;

            room.bannedLegends = [];
            console.log(`🧹 [リセット] 部屋 ${roomId} の全BANデータがリセットされました。`);
            broadcastToRoom(roomId, { type: "UPDATE_BAN_STATE", bannedLegends: room.bannedLegends });
        }
    });

    // 【自動解体・解放のログ】
    ws.on('close', function() {
        const roomId = ws.currentRoomId;
        console.log(`🔴 プレイヤーがブラウザを閉じるか、通信を切断しました。(直前まで部屋 [${roomId || 'なし'}] に滞在)`);

        if (!roomId || !rooms[roomId]) {
            printServerStatus();
            return;
        }

        let activeUsersInRoom = 0;
        wss.clients.forEach(function(client) {
            if (client.currentRoomId === roomId && client.readyState === WebSocket.OPEN) {
                activeUsersInRoom++;
            }
        });

        // 参加者が0人になったらメモリから削除
        if (activeUsersInRoom === 0) {
            delete rooms[roomId];
            console.log(`🚨 【データ破棄】部屋 ${roomId} は誰もいなくなったため、自動でリセット・解体されました。`);
        } else {
            console.log(`ℹ️ 部屋 ${roomId} にはまだ他のプレイヤー（${activeUsersInRoom}人）が残っているため、部屋は維持されます。`);
        }

        // 最終的な状況を表示
        printServerStatus();
    });
});

function broadcastToRoom(roomId, payload) {
    wss.clients.forEach(function each(client) {
        if (client.currentRoomId === roomId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}

console.log(`WebSocketサーバーがポート ${PORT} で起動しました...`);
printServerStatus();