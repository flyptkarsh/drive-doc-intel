"use client";

import { FolderSync, LogOut, Unplug } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/lib/types";

export function AccountMenu({
  user,
  driveConnected,
  onChangeFolder,
  onDisconnect,
  onSignOut,
}: {
  user: User;
  driveConnected: boolean;
  onChangeFolder: () => void;
  onDisconnect: () => void;
  onSignOut: () => void;
}) {
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button className="rounded-full" aria-label="Account menu" />}>
        <Avatar className="size-8">
          {user.picture && <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="font-medium text-foreground">{user.name}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {driveConnected && (
          <>
            <DropdownMenuItem onClick={onChangeFolder}>
              <FolderSync /> Change folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDisconnect}>
              <Unplug /> Disconnect Drive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
