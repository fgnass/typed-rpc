export interface BrokenService {
  sendInvalidVersion(): Promise<void>;
  sendInvalidJSON(): Promise<void>;
  sendUnknownID(): Promise<void>;
  sendServerError(): Promise<void>;
}
