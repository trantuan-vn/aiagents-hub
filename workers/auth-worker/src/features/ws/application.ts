import { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from './infrastructure/UserDO';
import { BroadcastServiceDO } from './infrastructure/BroadcastServiceDO';

interface IWebsocketApplicationService {
    connectWebSocketUseCase: (identifier: string) => Promise<Response>;
    broadcastMessageUseCase: (request: Request) => Promise<Response>;
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