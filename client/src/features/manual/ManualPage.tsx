import {
  ManualCover,
  ManualIntroSection,
  ManualEconomySection,
  ManualInfrastructureSection,
  ManualMachinesSection,
  ManualIncomeSection,
  ManualTournamentsSection,
  ManualWalletSection,
  ManualRankingSection,
  ManualFooter,
} from './components/manual.parts';

export default function ManualPage() {
  return (
    <div className="space-y-10 pb-24 animate-in fade-in duration-700">
      <ManualCover />
      <ManualIntroSection />
      <ManualEconomySection />
      <ManualInfrastructureSection />
      <ManualMachinesSection />
      <ManualIncomeSection />
      <ManualTournamentsSection />
      <ManualWalletSection />
      <ManualRankingSection />
      <ManualFooter />
    </div>
  );
}
