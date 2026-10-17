import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<HealthResponseDto> {
    const db = await this.pingDatabase();

    return {
      status: db ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      db,
    };
  }

  /** Cheapest possible liveness probe for Postgres. Never throws. */
  private async pingDatabase(): Promise<boolean> {
    try {
      if (!this.dataSource.isInitialized) {
        // Postgres may have come up after the API did — retry once, lazily.
        await this.dataSource.initialize();
      }
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.warn(
        `Database health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
