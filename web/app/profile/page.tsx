"use client";

import {AppShell} from "../../components/AppShell";
import {AccountPlanCard} from "../../components/AccountPlanCard";
import {FundedProfileCard} from "../../components/FundedProfileCard";
import {PermissionsCard} from "../../components/PermissionsCard";
import {ProfileOverview} from "../../components/ProfileOverview";
import {WalletProfileCard} from "../../components/WalletProfileCard";

export default function ProfilePage() {
  return (
    <AppShell statusStrip={false}>
      <ProfileOverview />

      <section className="grid two">
        <WalletProfileCard />
        <AccountPlanCard />
      </section>

      <section className="grid two">
        <PermissionsCard />
      </section>

      <FundedProfileCard />
    </AppShell>
  );
}
