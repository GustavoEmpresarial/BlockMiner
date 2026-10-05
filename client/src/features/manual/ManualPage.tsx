import { BookOpen } from 'lucide-react';
import IconBadge from '../../shared/components/IconBadge';
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
    <div className="space-y-10 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={BookOpen} variant="primary" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">Manual do Operador</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">Guia de referência técnica, econômica e operacional</p>
          </div>
        </div>
      </div>
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
