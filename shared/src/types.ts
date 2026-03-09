// ── Primitives ────────────────────────────────────────────────────────────────

export type Platform = "instagram" | "linkedin";

export type PostType = "text" | "image" | "video" | "carousel" | "link";

// ── Domain models ─────────────────────────────────────────────────────────────

export interface NormalizedUser {
  id: string;
  platform: Platform;
  username: string;
  displayName: string;
  profilePicUrl: string;
  isPrivate?: boolean;
  headline?: string;
}

export interface PostContent {
  text: string;
  mediaType: PostType;
  mediaUrls: string[];
  articleUrl?: string;
  articleTitle?: string;
}

export interface PostEngagement {
  likes: number;
  comments: number;
  shares?: number;
}

export interface NormalizedPost {
  id: string;
  platform: Platform;
  author: NormalizedUser;
  content: PostContent;
  engagement: PostEngagement;
  publishedAt: string;
  permalink: string;
  syncedAt: string;
}

// ── API contracts ─────────────────────────────────────────────────────────────

export interface FeedResponse {
  posts: NormalizedPost[];
  total: number;
  offset: number;
  limit: number;
}

export interface AccountsResponse {
  accounts: NormalizedUser[];
}

export interface SyncRequestPayload {
  platform: Platform;
  accountId: string;
}

// ── Extension messages ────────────────────────────────────────────────────────

export type SyncCommandType = "START_SYNC" | "GET_STATUS" | "CANCEL_SYNC";

export interface SyncCommand {
  type: SyncCommandType;
  payload?: SyncRequestPayload;
}

export type SyncStatus = "idle" | "syncing" | "error";

export interface SyncStatusResponse {
  status: SyncStatus;
  progress?: number;
  error?: string;
}
