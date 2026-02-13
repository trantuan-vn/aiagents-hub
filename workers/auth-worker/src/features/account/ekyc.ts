import { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { createEkycRepository } from './infrastructure';
import { EkycStatus } from './domain';

const ERROR_MESSAGES = { USER_NOT_FOUND: 'User not found' } as const;

export interface IAccountEkycApplication {
  getStatusUseCase(identifier: string): Promise<EkycStatus>;
  setDocumentSubmittedUseCase(identifier: string): Promise<void>;
  setDocumentVerifiedUseCase(identifier: string): Promise<void>;
  setFaceSubmittedUseCase(identifier: string): Promise<void>;
  setFaceVerifiedUseCase(identifier: string): Promise<void>;
  setVerifiedUseCase(identifier: string): Promise<void>;
  resetUseCase(identifier: string): Promise<void>;
  saveDocumentDataUseCase(identifier: string, data: { docType: 'passport' | 'cccd'; docExtractedData: string; docFrontKey: string; docBackKey?: string }): Promise<void>;
  saveFaceMediaKeyUseCase(identifier: string, faceMediaKey: string): Promise<void>;
  getDocumentKeysUseCase(identifier: string): Promise<{ docFrontKey: string | null; docBackKey: string | null }>;
  getFaceMediaKeyUseCase(identifier: string): Promise<string | null>;
}

export function createAccountEkycApplication(
  c: Context,
  bindingName: string
): IAccountEkycApplication {
  const getRepo = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    return createEkycRepository(userDO);
  };

  return {
    async getStatusUseCase(identifier: string): Promise<EkycStatus> {
      return getRepo(identifier).getStatus();
    },
    async setDocumentSubmittedUseCase(identifier: string): Promise<void> {
      await getRepo(identifier).setDocumentSubmitted();
    },
    async setDocumentVerifiedUseCase(identifier: string): Promise<void> {
      await getRepo(identifier).setDocumentVerified();
    },
    async setFaceSubmittedUseCase(identifier: string): Promise<void> {
      await getRepo(identifier).setFaceSubmitted();
    },
    async setFaceVerifiedUseCase(identifier: string): Promise<void> {
      await getRepo(identifier).setFaceVerified();
    },
    async setVerifiedUseCase(identifier: string): Promise<void> {
      await getRepo(identifier).setVerified();
    },
    async resetUseCase(identifier: string): Promise<void> {
      await getRepo(identifier).reset();
    },
    async saveDocumentDataUseCase(identifier: string, data: { docType: 'passport' | 'cccd'; docExtractedData: string; docFrontKey: string; docBackKey?: string }): Promise<void> {
      await getRepo(identifier).saveDocumentData(data);
    },
    async saveFaceMediaKeyUseCase(identifier: string, faceMediaKey: string): Promise<void> {
      await getRepo(identifier).saveFaceMediaKey(faceMediaKey);
    },
    async getDocumentKeysUseCase(identifier: string): Promise<{ docFrontKey: string | null; docBackKey: string | null }> {
      return getRepo(identifier).getDocumentKeys();
    },
    async getFaceMediaKeyUseCase(identifier: string): Promise<string | null> {
      return getRepo(identifier).getFaceMediaKey();
    },
  };
}
