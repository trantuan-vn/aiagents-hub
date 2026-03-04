import { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from './infrastructure/UserDO';
import { BroadcastServiceDO } from './infrastructure/BroadcastServiceDO';

export const FIRST_LOGIN_NOTIFICATION = {
    title: 'Bật xác thực 2 nhân tố',
    body: 'Để bảo vệ tài khoản, vui lòng bật xác thực hai nhân tố (Authenticator).',
    data: { link: '/dashboard/control/account/authenticator' },
} as const;

interface IWebsocketApplicationService {
    connectWebSocketUseCase: (identifier: string) => Promise<Response>;
    broadcastMessageUseCase: (request: Request) => Promise<Response>;
    sendNotificationToUserUseCase: (identifier: string, message: { title: string; body?: string; data?: Record<string, unknown> }) => Promise<void>;
    /** Lưu notification để gửi khi user connect WebSocket (đúng flow: login → token → WS connect → notification) */
    storePendingFirstLoginNotificationUseCase: (identifier: string) => Promise<void>;
    getDebugIdCountersUseCase: (identifier: string) => Promise<Response>;
    deleteTableStateUseCase: (identifier: string, tableName: string) => Promise<Response>;
}

export function createWebsocketApplicationService(c: Context, bindingName: string): IWebsocketApplicationService {
    return {
        connectWebSocketUseCase: async (identifier: string) => {
            const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;;
            const request = c.req.raw;
            const response = await userDO.fetch(request);
            if (response.status !== 101) {
                throw new Error(`Failed to connect WebSocket with identifier (${identifier}), status: ${response.status}`);
            }
            return response;
        },
        broadcastMessageUseCase: async (request: Request) => {
            const broadcastServiceDO = getIdFromName(c, "global", "BROADCAST_SERVICE_DO")  as DurableObjectStub<BroadcastServiceDO>;
            const response = await broadcastServiceDO.fetch(request);
            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Failed to broadcast message, status: ${response.status}, body: ${body}, url: ${request.url}, method: ${request.method}`);
            }
            return response;
        },
        sendNotificationToUserUseCase: async (identifier: string, message: { title: string; body?: string; data?: Record<string, unknown> }) => {
            try {
                console.log(`[WsApp] sendNotificationToUserUseCase ENTER: identifier=${identifier} bindingName=${bindingName} title=${message.title}`);
                const userDOBinding = c.env[bindingName] as DurableObjectNamespace;
                const userDoId = userDOBinding.idFromName(identifier).toString();
                console.log(`[WsApp] sendNotificationToUserUseCase: userDoId=${userDoId} targetUsers=[${userDoId}]`);
                const broadcastServiceDO = getIdFromName(c, "global", "BROADCAST_SERVICE_DO") as DurableObjectStub<BroadcastServiceDO>;
                const response = await broadcastServiceDO.fetch("https://broadcast.service/dashboard/ws/broadcast", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message: { title: message.title, body: message.body, data: message.data },
                        targetUsers: [userDoId],
                        priority: "normal",
                        expiresIn: 60_000,
                    }),
                });
                console.log(`[WsApp] sendNotificationToUserUseCase: response status=${response.status} ok=${response.ok} identifier=${identifier}`);
                if (!response.ok) {
                    const body = await response.text();
                    console.warn(`[WsApp] sendNotificationToUser failed for ${identifier}: ${response.status} ${body}`);
                } else {
                    console.log(`[WsApp] sendNotificationToUser success for ${identifier}`);
                }
            } catch (e) {
                console.warn(`[WsApp] sendNotificationToUser error for ${identifier}:`, e);
            }
        },
        storePendingFirstLoginNotificationUseCase: async (identifier: string) => {
            try {
                const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
                const response = await userDO.fetch('https://user.internal/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'storePendingFirstLoginNotification',
                        message: FIRST_LOGIN_NOTIFICATION,
                    }),
                });
                if (!response.ok) {
                    const body = await response.text();
                    console.warn(`[WsApp] storePendingFirstLoginNotification failed for ${identifier}: ${response.status} ${body}`);
                } else {
                    console.log(`[WsApp] storePendingFirstLoginNotification stored for ${identifier}`);
                }
            } catch (e) {
                console.warn(`[WsApp] storePendingFirstLoginNotification error for ${identifier}:`, e);
            }
        },
        getDebugIdCountersUseCase: async (identifier: string) => {
            const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
            const response = await userDO.fetch('https://user.do/debug/id-counters');
            if (!response.ok) {
                throw new Error(`Failed to get id-counters, status: ${response.status}`);
            }
            return response;
        },
        deleteTableStateUseCase: async (identifier: string, tableName: string) => {
            const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
            const response = await userDO.fetch(`https://user.do/queue/table-state-reset?tableName=${encodeURIComponent(tableName)}`, {
                method: 'GET'
            });
            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Failed to reset table state, status: ${response.status}, body: ${body}`);
            }
            return response;
        }
    }
}