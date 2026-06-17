'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useNav } from '@/lib/use-nav'
import { useFetch } from '@/lib/use-fetch'
import { STATUS_COLOR } from '@/lib/app-data'
import { Card, CardHead, Badge, Button } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'

interface ApiRoom {
  id: number
  roomCode: string
  floor: { name: string }
  softwareCount: number
  softwareMachineNos: number[]
  hardwareCount: number
  hardwareMachineNos: number[]
}

export default function SoftwarePage() {
  const go = useNav()
  const router = useRouter()
  const { data: me } = useFetch<{ user: { role: string } | null }>('/api/auth/me')
  const { data: rooms, loading, error, refetch } = useFetch<ApiRoom[]>('/api/rooms')

  useEffect(() => {
    if (me?.user?.role === 'GUEST') router.replace('/dashboard/ktv')
  }, [me, router])

  if (loading || !me) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
      <Icon name="refresh" size={28} style={{ marginBottom: 12, opacity: 0.4, animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }} />
      <div>Đang tải dữ liệu...</div>
    </div>
  )
  if (error) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <Icon name="alert" size={28} style={{ color: 'var(--err)', display: 'block', margin: '0 auto 12px' }} />
      <div style={{ color: 'var(--err-tx)', fontSize: 14, marginBottom: 16 }}>Không tải được dữ liệu. Vui lòng thử lại.</div>
      <Button variant="outline" size="sm" onClick={() => refetch()} icon="refresh">Thử lại</Button>
    </div>
  )
  if (!rooms) return null

  const swRows = rooms.filter(r => r.softwareCount > 0).sort((a, b) => b.softwareCount - a.softwareCount)
  const hwRows = rooms.filter(r => r.hardwareCount > 0).sort((a, b) => b.hardwareCount - a.hardwareCount)
  const totalSw = swRows.reduce((s, r) => s + r.softwareCount, 0)
  const totalHw = hwRows.reduce((s, r) => s + r.hardwareCount, 0)

  return (
    <div className="stack">
      {/* ── KPI ── */}
      <div className="grid-3">
        <Card className="lift" pad={20} style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'var(--soft-bg)', color: 'var(--soft)', display: 'grid', placeItems: 'center' }}><Icon name="software" size={24} /></div>
          <div><div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{totalSw}</div><div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>Máy lỗi phần mềm</div></div>
        </Card>
        <Card className="lift" pad={20} style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'var(--err-bg)', color: 'var(--err)', display: 'grid', placeItems: 'center' }}><Icon name="cpu" size={24} /></div>
          <div><div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{totalHw}</div><div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>Máy lỗi phần cứng</div></div>
        </Card>
        <Card className="lift" pad={20} style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'var(--good-bg)', color: 'var(--good)', display: 'grid', placeItems: 'center' }}><Icon name="rooms" size={24} /></div>
          <div><div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{new Set([...swRows, ...hwRows].map(r => r.id)).size}</div><div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>Phòng bị ảnh hưởng</div></div>
        </Card>
      </div>

      {/* ── Phần mềm ── */}
      <Card pad={0}>
        <div style={{ padding: '20px 22px 4px' }}>
          <CardHead title="Máy lỗi phần mềm theo phòng" sub="Cần cài lại hệ điều hành / phần mềm chuyên dụng" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead><tr>
              <th style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>Phòng</th>
              <th style={{ whiteSpace: 'nowrap' }}>Tầng</th>
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Số máy lỗi PM</th>
              <th style={{ whiteSpace: 'nowrap' }}>Danh sách máy</th>
              <th style={{ textAlign: 'right', paddingRight: 22 }}></th>
            </tr></thead>
            <tbody>
              {swRows.length === 0 && (
                <tr><td colSpan={5} style={{ paddingLeft: 22, color: 'var(--text-faint)', fontSize: 13 }}>Không có máy lỗi phần mềm</td></tr>
              )}
              {swRows.map(r => (
                <tr key={r.id} className="trow">
                  <td style={{ paddingLeft: 22 }}><Badge tone="soft">{r.roomCode}</Badge></td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.floor.name}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--soft-tx)' }}>{r.softwareCount}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {r.softwareMachineNos.map(no => (
                        <span key={no} style={{ width: 26, height: 26, borderRadius: 7, background: STATUS_COLOR['sw'], color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{no}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 22 }}>
                    <button className="linkbtn" onClick={() => go('room-detail', r.roomCode)}>Xử lý <Icon name="arrowR" size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Phần cứng ── */}
      <Card pad={0}>
        <div style={{ padding: '20px 22px 4px' }}>
          <CardHead title="Máy lỗi phần cứng theo phòng" sub="Cần kiểm tra và thay thế linh kiện" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead><tr>
              <th style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>Phòng</th>
              <th style={{ whiteSpace: 'nowrap' }}>Tầng</th>
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Số máy lỗi PC</th>
              <th style={{ whiteSpace: 'nowrap' }}>Danh sách máy</th>
              <th style={{ textAlign: 'right', paddingRight: 22 }}></th>
            </tr></thead>
            <tbody>
              {hwRows.length === 0 && (
                <tr><td colSpan={5} style={{ paddingLeft: 22, color: 'var(--text-faint)', fontSize: 13 }}>Không có máy lỗi phần cứng</td></tr>
              )}
              {hwRows.map(r => (
                <tr key={r.id} className="trow">
                  <td style={{ paddingLeft: 22 }}><Badge tone="err">{r.roomCode}</Badge></td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.floor.name}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--err-tx)' }}>{r.hardwareCount}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {r.hardwareMachineNos.map(no => (
                        <span key={no} style={{ width: 26, height: 26, borderRadius: 7, background: STATUS_COLOR['hw'] ?? 'var(--err)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{no}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 22 }}>
                    <button className="linkbtn" onClick={() => go('room-detail', r.roomCode)}>Xử lý <Icon name="arrowR" size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
