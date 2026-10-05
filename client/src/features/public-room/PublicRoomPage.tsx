import { useEffect, useState, useMemo } from 'react';
import type { SyntheticEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Cpu, Zap, ArrowLeft, Shield, Trophy, Gamepad2, Lock } from 'lucide-react';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import StatCard from '../../shared/components/StatCard';
import StatusPill from '../../shared/components/StatusPill';
import TabPills from '../../shared/components/TabPills';
import { api } from '../../shared/auth/auth.store';
import {
  getMachineBySlot,
  getMachineDescriptor,
  formatHashrate,
  RACKS_COUNT,
  SLOTS_PER_RACK,
  RACKS_PER_ROOM,
  SLOT_INDEX_BASE,
  DEFAULT_MINER_IMAGE_URL,
  sanitizeMachineImageSrc,
} from '../ranking/lib/ranking.utils';

interface RoomMiner {
  slotIndex?: number;
  slot_index?: number;
  hashRate?: number;
  hash_rate?: number;
  isSecondSlot?: boolean;
  minerName?: string;
  miner_name?: string;
  name?: string;
  imageUrl?: string;
  image_url?: string;
  slotSize?: number;
  slot_size?: number;
}

interface RoomInfoRow {
  roomNumber: number;
  unlocked?: boolean;
}

interface PublicRoomUserPayload {
  miners?: RoomMiner[];
  racks?: Record<string, string>;
  rooms?: RoomInfoRow[];
  gamePower?: number;
  username: string;
}

interface PublicRoomApiResponse {
  ok?: boolean;
  user?: PublicRoomUserPayload;
}

interface RackCardProps {
  rackIndex: number;
  rackName: string;
  rackBaseSlot: number;
  machines: RoomMiner[];
}

function RackCard({ rackName, rackBaseSlot, machines }: RackCardProps) {
  const slots = useMemo(
    () =>
      Array.from({ length: SLOTS_PER_RACK }, (_, localI) =>
        getMachineBySlot(rackBaseSlot + localI, machines),
      ),
    [rackBaseSlot, machines],
  );

  const occupied = slots.filter((m): m is RoomMiner => Boolean(m && !m.isSecondSlot));
  const rackHashRate = occupied.reduce((s, m) => s + Number(m?.hashRate || m?.hash_rate || 0), 0);
  const fillPct = Math.round((occupied.length / SLOTS_PER_RACK) * 100);
  const isEmpty = occupied.length === 0;

  return (
    <div
      className={`rounded-3xl border-2 bg-slate-900/60 shadow-[4px_4px_0px_#000000] overflow-hidden ${
        isEmpty ? 'border-slate-800' : 'border-slate-700'
      }`}
    >
      <div className="px-3 py-2.5 bg-gray-900/60 border-b border-gray-800/40 flex items-center justify-between relative">
        <div
          className={`absolute left-0 top-0 w-0.5 h-full ${isEmpty ? 'bg-gray-700/20' : 'bg-primary/50'}`}
        />
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              occupied.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700'
            }`}
          />
          <span className="text-[10px] font-black text-white italic uppercase tracking-tight truncate">
            {rackName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {rackHashRate > 0 && (
            <span className="text-[9px] font-black text-primary italic hidden sm:block">
              {formatHashrate(rackHashRate)}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-1 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <span className="text-[9px] font-black text-slate-300 tabular-nums font-mono">
              {occupied.length}/{SLOTS_PER_RACK}
            </span>
          </div>
        </div>
      </div>

      <div className="p-2.5 grid grid-cols-4 gap-1.5">
        {slots.map((machine, localI) => {
          if (machine?.isSecondSlot) return null;
          const descriptor = machine ? getMachineDescriptor(machine) : null;
          const isOccupied = !!machine;
          const isDouble = descriptor?.size === 2;

          return (
            <div
              key={localI}
              className={`relative aspect-square rounded-lg border flex items-center justify-center overflow-hidden transition-colors
                                ${isDouble ? 'col-span-2' : ''}
                                ${
                                  isOccupied
                                    ? 'bg-gray-800/40 border-gray-700/40 hover:border-primary/30'
                                    : 'bg-gray-950/20 border-dashed border-gray-800/20 opacity-25'
                                }`}
            >
              {isOccupied && descriptor ? (
                <div className="relative w-full h-full p-1 flex items-center justify-center group">
                  <img
                    src={sanitizeMachineImageSrc(descriptor.image)}
                    alt={descriptor.name}
                    className="w-4/5 h-4/5 object-contain drop-shadow-sm"
                    onError={(e: SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.src = DEFAULT_MINER_IMAGE_URL;
                    }}
                  />
                  <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-primary animate-pulse" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg gap-0.5 p-1 text-center">
                    <span className="text-[7px] font-black text-primary uppercase leading-tight">
                      {descriptor.name}
                    </span>
                    <span className="text-[9px] font-black text-white italic">
                      {formatHashrate(machine.hashRate || 0)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-1 h-1 rounded-full bg-gray-800" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PublicRoomPage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [targetUser, setTargetUser] = useState<PublicRoomUserPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await api.get<PublicRoomApiResponse>(`/ranking/room/${username}`);
        if (res.data.ok && res.data.user) setTargetUser(res.data.user);
        else navigate('/ranking');
      } catch {
        navigate('/ranking');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const machines: RoomMiner[] = useMemo(() => targetUser?.miners || [], [targetUser?.miners]);
  const racks = targetUser?.racks || {};
  const roomList: RoomInfoRow[] = targetUser?.rooms || [];

  const totalHashRate = useMemo(
    () =>
      machines.reduce((s: number, m) => s + Number(m.hashRate || m.hash_rate || 0), 0) +
      (targetUser?.gamePower || 0),
    [machines, targetUser],
  );

  const gamePower = targetUser?.gamePower || 0;

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        <div className="flex items-center gap-4 pb-3 border-b-2 border-slate-800">
          <IconBadge icon={Shield} size="lg" />
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">Sala</h1>
        </div>
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-sky-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-slate-300 font-black uppercase tracking-[0.25em] text-[10px]">
              Sincronizando…
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!targetUser) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        <div className="flex items-center gap-4 pb-3 border-b-2 border-slate-800">
          <IconBadge icon={Shield} variant="red" size="lg" />
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">Sala</h1>
        </div>
        <Card>
          <div className="flex flex-col items-center justify-center gap-4 px-4 py-16">
            <p className="text-red-300 font-bold text-center">Erro ao carregar dados da sala.</p>
            <button
              type="button"
              onClick={() => navigate('/ranking')}
              className="px-6 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl text-sm font-black uppercase shadow-[2px_2px_0px_#000000]"
            >
              Voltar
            </button>
          </div>
        </Card>
      </div>
    );
  }

  const currentRoomInfo = roomList.find((r) => r.roomNumber === activeRoom);
  const isLocked = currentRoomInfo && !currentRoomInfo.unlocked;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-4 min-w-0">
          <IconBadge icon={Shield} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white truncate">
                {targetUser.username}
              </h1>
              <StatusPill variant="primary" icon={Shield} label="visita" />
            </div>
            <p className="text-slate-400 text-xs sm:text-sm font-medium flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" /> Rede global
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/ranking')}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl border-2 border-slate-600 font-black text-[10px] uppercase tracking-wider shadow-[2px_2px_0px_#000000]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Voltar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Zap} accent="text-sky-400" label="Hashrate" value={formatHashrate(totalHashRate)} />
        <StatCard icon={Gamepad2} accent="text-violet-400" label="Jogos" value={formatHashrate(gamePower)} />
        <StatCard icon={Cpu} accent="text-emerald-400" label="Miners" value={String(machines.length)} />
      </div>

      {roomList.length > 0 && (
        <TabPills
          ariaLabel="Salas"
          activeTab={String(activeRoom)}
          onChange={(key) => setActiveRoom(Number(key))}
          tabs={roomList.map((room) => ({
            key: String(room.roomNumber),
            label: `Sala ${room.roomNumber}`,
            disabled: !room.unlocked,
            icon: room.unlocked ? undefined : Lock,
          }))}
        />
      )}

      {isLocked ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <IconBadge icon={Lock} variant="neutral" size="lg" />
            <div className="text-center px-4">
              <p className="text-base font-black text-slate-200 uppercase">
                Sala {activeRoom} bloqueada
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Este minerador ainda não adquiriu esta sala.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: RACKS_COUNT }).map((_, i) => {
            const rackIndex = i + 1;
            const rackBaseSlot =
              SLOT_INDEX_BASE +
              (activeRoom - 1) * RACKS_PER_ROOM +
              (rackIndex - 1) * SLOTS_PER_RACK;
            return (
              <RackCard
                key={rackIndex}
                rackIndex={rackIndex}
                rackName={racks[String(rackIndex)] || `Rack ${rackIndex}`}
                rackBaseSlot={rackBaseSlot}
                machines={machines}
              />
            );
          })}
        </div>
      )}

      <div className="flex justify-center">
        <StatusPill variant="neutral" icon={Shield} label="Modo visitação — somente leitura" />
      </div>
    </div>
  );
}
