import type { Pool } from 'pg';
import { AccountService } from './accounts.js';
import { EconomyService } from './economy.js';
import { AdminService } from './admin.js';
import { PrayerService } from './prayer.js';

export { AccountService, createAccountService } from './accounts.js';
export { EconomyService, createEconomyService } from './economy.js';
export { AdminService, createAdminService } from './admin.js';
export { PrayerService, PrayerBreakError, createPrayerService } from './prayer.js';
export { ServiceError } from './errors.js';
export interface BackendServices { accounts:AccountService; economy:EconomyService; admin:AdminService; prayer:PrayerService }
export function createServices(pool:Pool,options:{prayerNow?:()=>Date}={}):BackendServices {
  return {accounts:new AccountService(pool),economy:new EconomyService(pool),admin:new AdminService(pool),prayer:new PrayerService(pool,{now:options.prayerNow})};
}
