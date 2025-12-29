/**
 * BentoCache 드라이버 re-export
 *
 * @example
 * import { drivers, store } from 'sonamu/cache';
 *
 * cache: {
 *   stores: {
 *     main: store()
 *       .useL1Layer(drivers.memory({ maxSize: '100mb' }))
 *       .useL2Layer(drivers.redis({ connection }))
 *       .useBus(drivers.redisBus({ connection }))
 *   }
 * }
 */

// Store builder
export { bentostore as store } from "bentocache";

import { fileDriver as _fileDriver } from "bentocache/drivers/file";
import { knexDriver as _knexDriver } from "bentocache/drivers/knex";
import { memoryDriver as _memoryDriver } from "bentocache/drivers/memory";
import {
  redisBusDriver as _redisBusDriver,
  redisDriver as _redisDriver,
} from "bentocache/drivers/redis";

// 개별 드라이버 export
export const memoryDriver = _memoryDriver;
export const fileDriver = _fileDriver;
export const redisDriver = _redisDriver;
export const redisBusDriver = _redisBusDriver;
export const knexDriver = _knexDriver;

// 편의를 위한 drivers 객체
export const drivers = {
  memory: _memoryDriver,
  file: _fileDriver,
  redis: _redisDriver,
  redisBus: _redisBusDriver,
  knex: _knexDriver,
};
