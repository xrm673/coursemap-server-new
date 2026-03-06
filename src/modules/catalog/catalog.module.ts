import { Module } from '@nestjs/common';
import { CatalogRepo } from './repo/catalog.repo';
import { CatalogService } from './service/catalog.service';
import { CatalogController } from './controller/catalog.controller';

@Module({
  providers: [CatalogRepo, CatalogService],
  controllers: [CatalogController],
})
export class CatalogModule {}
