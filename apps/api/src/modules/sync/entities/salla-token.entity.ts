import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedSecretTransformer } from '../crypto/token-encryption';

/**
 * OAuth credentials for one Salla store (Easy Mode / app installation).
 *
 * accessToken and refreshToken are encrypted at rest with AES-256-GCM under
 * SALLA_TOKEN_ENC_KEY — see crypto/token-encryption.ts for the wire format. The
 * column type stays `text`: ciphertext is base64, so nothing about the schema
 * changes, and the transformer is transparent to every query.
 *
 * Consequence worth knowing: a plain `SELECT access_token FROM salla_tokens` in
 * psql shows ciphertext, and that is the intended reading experience. Anything
 * that needs the real value goes through the entity.
 */
@Entity({ name: 'salla_tokens' })
export class SallaToken {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /** Salla store id. One row per store; re-installing updates it in place. */
  @Index('uq_salla_tokens_store_id', { unique: true })
  @Column({ name: 'store_id', type: 'bigint' })
  storeId!: string;

  /** Encrypted at rest. Never log this value, not even truncated. */
  @Column({ name: 'access_token', type: 'text', transformer: encryptedSecretTransformer })
  accessToken!: string;

  /** Encrypted at rest. Never log this value, not even truncated. */
  @Column({ name: 'refresh_token', type: 'text', transformer: encryptedSecretTransformer })
  refreshToken!: string;

  @Index('idx_salla_tokens_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'scope', type: 'text', nullable: true })
  scope!: string | null;

  @Column({ name: 'installed_at', type: 'timestamptz' })
  installedAt!: Date;

  /** Set when the merchant uninstalls the app; the row is kept for audit. */
  @Index('idx_salla_tokens_revoked_at')
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
