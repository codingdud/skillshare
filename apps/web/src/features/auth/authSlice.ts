import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@skillshare/contracts';
const slice = createSlice({
  name: 'auth',
  initialState: { user: null as User | null, ready: false },
  reducers: {
    sessionChanged(state, action: PayloadAction<User | null>) {
      state.user = action.payload;
      state.ready = true;
    },
  },
});
export const { sessionChanged } = slice.actions;
export default slice.reducer;
