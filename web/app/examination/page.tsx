"use client";

import {AppShell} from "../../components/AppShell";
import {AgentAuthorizationPanel} from "../../components/AgentAuthorizationPanel";
import {ChallengeProgress} from "../../components/ChallengeProgress";
import {DemoScriptPanel} from "../../components/DemoScriptPanel";
import {ExaminationLedger} from "../../components/ExaminationLedger";
import {ExaminationOverview} from "../../components/ExaminationOverview";
import {RuleStatusPanel} from "../../components/RuleStatusPanel";
import {TierSelector} from "../../components/TierSelector";

export default function ExaminationPage() {
  return (
    <AppShell statusStrip={false}>
      <ExaminationOverview />

      <section className="grid two">
        <TierSelector />
        <ChallengeProgress />
      </section>

      <section className="grid two">
        <RuleStatusPanel />
        <div className="grid">
          <AgentAuthorizationPanel />
          <DemoScriptPanel />
        </div>
      </section>

      <ExaminationLedger />
    </AppShell>
  );
}
