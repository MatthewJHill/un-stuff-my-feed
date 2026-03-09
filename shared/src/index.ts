// Shared types for Un-Stuff My Feed

export type Platform = "twitter" | "instagram" | "reddit" | "youtube" | "bluesky";

export interface Account {
  id: number;
  platform: Platform;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedItem {
  id: number;
  accountId: number;
  platform: Platform;
  externalId: string;
  content: string;
  mediaUrls: string[];
  postedAt: string;
  fetchedAt: string;
}

export interface SyncResult {
  accountId: number;
  platform: Platform;
  username: string;
  itemsFetched: number;
  error?: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  offset: number;
  limit: number;
}
