"use client";

import * as React from "react";

import { User } from "@/data/users";

const DashboardUserContext = React.createContext<User | null>(null);

export function DashboardUserProvider({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  return (
    <DashboardUserContext.Provider value={user}>
      {children}
    </DashboardUserContext.Provider>
  );
}

export function useDashboardUser(): User | null {
  return React.useContext(DashboardUserContext);
}
