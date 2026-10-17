import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum SyncRunKind {
  Webhook = 'webhook',
  Reconcile = 'reconcile',
  Manual = 'manual',
}

export enum SyncRunStatus {
  Running = 'running',
  Succeeded = 'succeeded',
  Partial = 'partial',
  Failed = 'failed',
}

/**
 * One execution of a sync — a webhook drain, the nightly reconcile, or a manual
 * kick. The counters are what makes a reconcile auditable: "saw 213, updated 4,
 * deleted 0" is the difference between a healthy night and a silent wipe.
 */
@Entity({ name: 'sync_runs' })
@Index('idx_sync_runs_kind_started_at', ['kind', 'startedAt'])
export class SyncRun {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Index('idx_sync_runs_kind')
  @Column({
    name: 'kind',
    type: 'enum',
    enum: SyncRunKind,
  })
  kind!: SyncRunKind;

  @Index('idx_sync_runs_started_at')
  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ name: 'entities_seen', type: 'int', default: 0 })
  entitiesSeen!: number;

  @Column({ name: 'entities_created', type: 'int', default: 0 })
  entitiesCreated!: number;

  @Column({ name: 'entities_updated', type: 'int', default: 0 })
  entitiesUpdated!: number;

  @Column({ name: 'entities_deleted', type: 'int', default: 0 })
  entitiesDeleted!: number;

  @Index('idx_sync_runs_status')
  @Column({
    name: 'status',
    type: 'enum',
    enum: SyncRunStatus,
    default: SyncRunStatus.Running,
  })
  status!: SyncRunStatus;

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null;
}
