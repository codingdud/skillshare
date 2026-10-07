import { z } from 'zod';

export const harnessRatingInputSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).default(''),
});
export const harnessRatingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export type HarnessRatingSummary = {
  average: number | null;
  count: number;
  distribution: [number, number, number, number, number];
};
export type HarnessRating = {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
};
export type HarnessRatingsPage = {
  summary: HarnessRatingSummary;
  items: HarnessRating[];
  mine: HarnessRating | null;
  canRate: boolean;
  page: number;
  pageSize: number;
  total: number;
};
