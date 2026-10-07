import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Pencil, Terminal, UserRound, ShieldCheck } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { notify } from '../app/store';
import { transport, errorMessage } from '../lib/http';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AccountMenu({ onSignedOut }: { onSignedOut?: () => void }) {
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  async function logout() {
    setBusy(true);
    try {
      await transport.logout();
      onSignedOut?.();
      navigate('/');
    } catch (error) {
      dispatch(notify(errorMessage(error)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-10 gap-1.5 rounded-full px-1.5"
          aria-label="Account menu"
          title="Account menu"
        >
          <Avatar>
            <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
              {user.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ChevronDown size={14} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" data-testid="account-menu">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <strong className="truncate text-sm font-semibold text-foreground">{user.name}</strong>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserRound /> Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/profile/edit">
            <Pencil /> Edit profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/devices">
            <Terminal /> Connected devices
          </Link>
        </DropdownMenuItem>
        {user.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheck /> Administration
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => void logout()}>
          <LogOut />
          {busy ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
