/** Wire and simulation contracts. This module has no browser or server imports. */
export const CAR_IDS = ['brz', 'veyron77', 'aventador', 'skyline', 'veloce', 'apex', 'cinder', 'kaze'] as const;
export type CarId = typeof CAR_IDS[number];
export const CIRCUIT_IDS = ['city', 'beach', 'glacier'] as const;
export type CircuitId = typeof CIRCUIT_IDS[number];
export type Finish = 'gloss' | 'metallic' | 'matte';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type CollisionMode = 'solid' | 'ghost';
export type RacePhase = 'lobby' | 'loading' | 'countdown' | 'racing' | 'settling' | 'finished' | 'aborted';

export interface VehicleStats {
  /** Kilometers/hour; used by the original arcade speed limit. */
  topSpeed: number;
  /** Seconds from0–100km/h; acceleration is27.78/zeroTo100. */
  zeroTo100: number;
  /** Multiplier of the original speed-dependent steering rate. */
  handling: number;
}
export interface LoadoutSelection {
  carId: CarId;
  color: string;
  finish: Finish;
  rimId?: string | null;
  rimColor?: string;
}
export interface FrozenLoadout extends LoadoutSelection {
  rimId: string | null;
  stats: VehicleStats;
  tuningVersion: string;
  partVersion?: string;
}
export interface RoomConfig {
  circuit: CircuitId;
  laps: number;
  bots: number;
  maxHumans: number;
  difficulty: Difficulty;
  collisionMode: CollisionMode;
}
export interface PhysicsConfig {
  tickRate: number;
  nitroMultiplier: number;
  nitroAccelerationMultiplier: number;
  nitroDrain: number;
  nitroRecharge: number;
  driftRecharge: number;
  brakeRate: number;
  coastDrag: number;
  reverseSpeed: number;
  resetCooldownMs: number;
}
export interface RaceRuleset {
  version: string;
  cars: Record<CarId, VehicleStats>;
  physics?: Partial<PhysicsConfig>;
  rewardPolicy?: unknown;
}
export interface SessionUser {
  id: string;
  displayName: string;
  role?: string;
  csrfToken?: string;
}
export interface VehicleInput {
  seq: number;
  throttle: number;
  brake: number;
  steer: number;
  nitro: boolean;
  reset?: boolean;
  /** Informational only. Server simulation never trusts client elapsed time. */
  clientTick?: number;
}
export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  steerAngle: number;
  driftAngle: number;
  bodyRoll: number;
  bodyPitch: number;
  nitro: number;
  nitroActive: boolean;
  trackIdx: number;
  trackT: number;
  lastTrackT: number;
  progress: number;
  nextGate: number;
  lap: number;
  completedLaps: number;
  lapStartedMs: number | null;
  lastLapMs: number | null;
  bestLapMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;
  distanceMeters: number;
  lastResetMs: number;
}
export interface RacerState extends VehicleState {
  id: string;
  userId: string | null;
  name: string;
  isBot: boolean;
  loadout: FrozenLoadout;
  connected: boolean;
  ghost: boolean;
  dnf: boolean;
  lastProcessedSeq: number;
  input: VehicleInput;
  inputReceivedMs: number;
  disconnectedAtMs: number | null;
  botLane: number;
  botTargetLane: number;
  botLaneTimer: number;
  botSeed: number;
}
export interface RacerSnapshot extends VehicleState {
  id: string;
  userId: string | null;
  name: string;
  isBot: boolean;
  loadout: FrozenLoadout;
  connected: boolean;
  ghost: boolean;
  dnf: boolean;
  lastProcessedSeq: number;
  position: number;
  lapTimeMs: number;
}
export interface RoomMember {
  id: string;
  userId: string;
  name: string;
  host: boolean;
  ready: boolean;
  assetsLoaded: boolean;
  connected: boolean;
  loadout: FrozenLoadout;
}
export interface RoomSnapshot {
  protocol: 1;
  roomId: string;
  inviteCode: string;
  raceId: string | null;
  phase: RacePhase;
  tick: number;
  serverTime: number;
  elapsedMs: number;
  startAt: number | null;
  config: RoomConfig;
  rulesetVersion: string | null;
  trackVersion: string;
  physics: PhysicsConfig;
  hostId: string | null;
  members: RoomMember[];
  racers: RacerSnapshot[];
  settlementError?: string;
}
export interface RaceParticipantResult {
  id: string;
  userId: string | null;
  isBot: boolean;
  name: string;
  carId: CarId;
  loadout: FrozenLoadout;
  status: 'finished' | 'dnf';
  position: number;
  completedLaps: number;
  bestLapMs: number | null;
  totalTimeMs: number | null;
  progress: number;
  distanceMeters: number;
  connectedAtFinish: boolean;
}
export interface BeginRaceInput {
  raceId: string;
  roomId: string;
  inviteCode: string;
  config: RoomConfig;
  rulesetVersion: string;
  createdAt: string;
  scheduledStartAt?: string;
  participants: Array<Pick<RaceParticipantResult, 'id' | 'userId' | 'isBot' | 'name' | 'carId' | 'loadout'>>;
}
export interface RaceResult {
  raceId: string;
  roomId: string;
  inviteCode: string;
  config: RoomConfig;
  rulesetVersion: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  participants: RaceParticipantResult[];
}
export interface RaceSettlement {
  raceId: string;
  rewards: Array<{ userId: string; amount: string; balance: string }>;
}
export interface GameplayEvent {
  type: 'rail' | 'collision' | 'reset' | 'lap' | 'finish';
  racerId?: string;
  otherId?: string;
  intensity?: number;
  lap?: number;
}
