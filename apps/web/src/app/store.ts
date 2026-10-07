import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import auth, { sessionChanged } from '../features/auth/authSlice';
import explore from '../features/explore/exploreSlice';
import { transport } from '../lib/http';
import { readTheme, type Theme } from './theme';
const ui = createSlice({
  name: 'ui',
  initialState: {
    notice: '',
    theme: readTheme(),
  },
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
    notify(state, action: PayloadAction<string>) {
      state.notice = action.payload;
    },
  },
});
export const { notify, setTheme } = ui.actions;
export const store = configureStore({ reducer: { auth, explore, ui: ui.reducer } });
transport.subscribe((session) => store.dispatch(sessionChanged(session?.user ?? null)));
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
