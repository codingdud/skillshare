import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { HarnessDiscoveryItem, HarnessDiscoveryPage } from '@skillshare/contracts';
import { api, errorMessage } from '../../lib/http';
export const fetchDiscovery = createAsyncThunk(
  'explore/fetch',
  async (query: string, { signal, rejectWithValue }) => {
    try {
      return (await api.get<HarnessDiscoveryPage>('/harnesses/discover?' + query, { signal })).data;
    } catch (error) {
      return rejectWithValue(errorMessage(error));
    }
  },
);
const slice = createSlice({
  name: 'explore',
  initialState: {
    items: [] as HarnessDiscoveryItem[],
    total: 0,
    page: 1,
    pageSize: 20,
    runtimes: [] as string[],
    status: 'idle',
    error: '',
    requestId: '',
    query: '',
  },
  reducers: {
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDiscovery.pending, (state, action) => {
        state.status = 'loading';
        state.requestId = action.meta.requestId;
        state.error = '';
      })
      .addCase(fetchDiscovery.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        Object.assign(state, action.payload);
        state.status = 'success';
      })
      .addCase(fetchDiscovery.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.status = 'error';
        state.error = String(action.payload ?? 'Unable to load Harness releases.');
      });
  },
});
export const { setQuery } = slice.actions;
export default slice.reducer;
