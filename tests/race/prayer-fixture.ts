import type {PrayerStatus,PrayerWindow} from '../../shared/prayer.js';

/** Protocol tests inject a trusted clock/schedule; calculation and persistence
 * are independently tested with native PostgreSQL in prayer.integration.test. */
export function allowedPrayerStatus(now=Date.now()):PrayerStatus{
 const next:PrayerWindow={eventId:'future-'+now,prayer:'dhuhr',name:'Zuhur',startedAt:new Date(now+3600000).toISOString(),resumesAt:new Date(now+4500000).toISOString()};
 return{enabled:true,allowed:true,paused:false,serverNow:new Date(now).toISOString(),localDate:new Date(now).toISOString().slice(0,10),pauseEndsAt:null,currentPrayer:null,nextPrayer:next,dailyTimes:[next],
  location:{mode:'fallback',cityId:'jakarta',label:'Jakarta',latitude:-6.2088,longitude:106.8456,timezone:'Asia/Jakarta',fallbackReason:null},
  calculation:{method:'location-20-18-v1',label:'Injected test schedule',fajrAngle:20,ishaAngle:18,adjustmentMinutes:2,rounding:'up',madhab:'Shafi',official:false},message:'Game tersedia.'};
}
