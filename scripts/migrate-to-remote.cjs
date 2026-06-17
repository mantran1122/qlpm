// One-time script: copy local DB data → remote TiDB Cloud
// Usage: node scripts/migrate-to-remote.cjs
'use strict'
const { PrismaClient } = require('@prisma/client')

const LOCAL_URL  = 'mysql://root:123456@localhost:3306/phong_may_db'
const REMOTE_URL = 'mysql://2ACBvX67PzxLD8z.root:NvZ4SurihCYqhR3g@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/phong_may_db?sslaccept=strict'

const local  = new PrismaClient({ datasources: { db: { url: LOCAL_URL  } } })
const remote = new PrismaClient({ datasources: { db: { url: REMOTE_URL } } })

function log(msg) { process.stdout.write(msg + '\n') }

async function main() {
  log('=== Bắt đầu migrate data ===\n')

  // ── Floors ──────────────────────────────────────────────────────────────────
  const floors = await local.floor.findMany()
  log(`Floors: ${floors.length}`)
  for (const r of floors) {
    await remote.floor.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── Rooms ───────────────────────────────────────────────────────────────────
  const rooms = await local.room.findMany()
  log(`Rooms: ${rooms.length}`)
  for (const r of rooms) {
    await remote.room.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── Machines ─────────────────────────────────────────────────────────────────
  const machines = await local.machine.findMany()
  log(`Machines: ${machines.length}`)
  for (const r of machines) {
    await remote.machine.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── Users ───────────────────────────────────────────────────────────────────
  const users = await local.user.findMany()
  log(`Users: ${users.length}`)
  for (const r of users) {
    await remote.user.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── UserProfiles ─────────────────────────────────────────────────────────────
  const profiles = await local.userProfile.findMany()
  log(`UserProfiles: ${profiles.length}`)
  for (const r of profiles) {
    await remote.userProfile.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── Technicians ──────────────────────────────────────────────────────────────
  const techs = await local.technician.findMany()
  log(`Technicians: ${techs.length}`)
  for (const r of techs) {
    await remote.technician.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── MaintenanceLogs ──────────────────────────────────────────────────────────
  const logs = await local.maintenanceLog.findMany()
  log(`MaintenanceLogs: ${logs.length}`)
  for (const r of logs) {
    await remote.maintenanceLog.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── DevicePreRepairStatus ─────────────────────────────────────────────────────
  const preRepairs = await local.devicePreRepairStatus.findMany()
  log(`DevicePreRepairStatus: ${preRepairs.length}`)
  for (const r of preRepairs) {
    await remote.devicePreRepairStatus.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── RecallRecords ─────────────────────────────────────────────────────────────
  const recalls = await local.recallRecord.findMany()
  log(`RecallRecords: ${recalls.length}`)
  for (const r of recalls) {
    await remote.recallRecord.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── RecallAlerts ──────────────────────────────────────────────────────────────
  const alerts = await local.recallAlert.findMany()
  log(`RecallAlerts: ${alerts.length}`)
  for (const r of alerts) {
    await remote.recallAlert.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── Notifications ─────────────────────────────────────────────────────────────
  const notifs = await local.notification.findMany()
  log(`Notifications: ${notifs.length}`)
  for (const r of notifs) {
    await remote.notification.upsert({ where: { id: r.id }, create: r, update: r })
  }

  // ── AuditLogs ─────────────────────────────────────────────────────────────────
  const audits = await local.auditLog.findMany()
  log(`AuditLogs: ${audits.length}`)
  for (const r of audits) {
    await remote.auditLog.upsert({ where: { id: r.id }, create: r, update: r })
  }

  log('\n=== Hoàn thành! ===')
}

main()
  .catch(e => { console.error('LỖI:', e.message); process.exit(1) })
  .finally(async () => { await local.$disconnect(); await remote.$disconnect() })
