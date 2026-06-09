"use client";

import {AppShell} from "../../components/AppShell";
import {ExamGateBanner} from "../../components/ExamGateBanner";
import {AgentAuthorizationPanel} from "../../components/AgentAuthorizationPanel";
import {ChallengeProgress} from "../../components/ChallengeProgress";
import {DemoScriptPanel} from "../../components/DemoScriptPanel";
import {ExaminationLedger} from "../../components/ExaminationLedger";
import {ExaminationOverview} from "../../components/ExaminationOverview";
import {RuleStatusPanel} from "../../components/RuleStatusPanel";
import {TierSelector} from "../../components/TierSelector";
import {TradingSurface} from "../../components/TradingSurface";

export default function ExaminationPage() {
  return (
    <AppShell statusStrip={false}>
      <ExamGateBanner />

      <ExaminationOverview />

      <TradingSurface surface="examination" />

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
