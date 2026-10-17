import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { SallaPingDto } from '../client/dto/salla-api.dto';
import type { ReconcileSummary } from '../catalog/reconcile.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { EventRetryResultDto, SallaRefreshResultDto, SallaStatusDto } from './dto/salla-status.dto';
import { SallaAdminService } from './salla-admin.service';

/**
 * Operational endpoints for the Salla connection. Not public — every route is
 * behind the shared-secret guard, and none of them returns token material.
 */
@ApiTags('admin')
@Controller('admin/salla')
@UseGuards(AdminApiKeyGuard)
export class SallaAdminController {
  constructor(private readonly admin: SallaAdminService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Connection, sync and event health',
    description:
      'Token state, the last SyncRun with its counters, pending and failed events with their ' +
      'last error, and how much of the catalog is matched to Salla versus seed-only.',
  })
  status(): Promise<SallaStatusDto> {
    return this.admin.getStatus();
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(): Promise<SallaRefreshResultDto> {
    return this.admin.refresh();
  }

  @Get('ping')
  ping(): Promise<SallaPingDto> {
    return this.admin.ping();
  }

  /**
   * DRY RUN BY DEFAULT. `?apply=true` is required to write.
   *
   * This endpoint can soft-delete products. The difference between reporting a
   * diff and applying one is a single query parameter, and the safe side of
   * that line has to be the side you land on by accident — a stray curl, a
   * copied command, a monitoring probe hitting the wrong URL. Anyone who means
   * it can type five more characters.
   */
  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reconcile the local catalog against Salla',
    description:
      'DRY RUN unless `?apply=true`. A dry run performs every read and comparison and writes ' +
      'nothing, returning exactly what it would have changed.',
  })
  @ApiQuery({
    name: 'apply',
    required: false,
    description: 'Set to `true` to actually write. Anything else — including omitting it — is a dry run.',
  })
  @ApiResponse({ status: 200, description: 'The SyncRun summary and the change list.' })
  reconcile(@Query('apply') apply?: string): Promise<ReconcileSummary> {
    // Strict equality against 'true': `?apply=1`, `?apply` and `?apply=false`
    // all mean dry run. A permissive parse here is how a typo writes to prod.
    return this.admin.reconcile({ dryRun: apply !== 'true' });
  }

  @Post('events/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Requeue a failed event',
    description:
      'Sets the event back to pending and announces it to the worker. The attempt counter is ' +
      'NOT reset — a manual retry buys one more attempt, not a fresh budget of five.',
  })
  retryEvent(@Param('id', ParseUUIDPipe) id: string): Promise<EventRetryResultDto> {
    return this.admin.retryEvent(id);
  }
}
