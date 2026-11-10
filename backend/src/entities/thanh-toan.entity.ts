import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { LichHen } from './lich-hen.entity';

@Entity({ name: 'ThanhToan' })
export class ThanhToan {
  @PrimaryColumn({ name: 'MaThanhToan', type: 'char', length: 10 })
  maThanhToan!: string;

  @Column({ name: 'MaLichHen', type: 'char', length: 10 })
  maLichHen!: string;

  @Column({ name: 'SoTienThanhToan', type: 'money' })
  soTienThanhToan!: number;

  @Column({ name: 'NgayGhiNhan', type: 'datetime' })
  ngayGhiNhan!: Date;

  @Column({ name: 'TrangThaiGiaoDich', type: 'nvarchar', length: 30 })
  trangThaiGiaoDich!: string;

  @Column({ name: 'KhoanHoanTien', type: 'money', nullable: true, default: 0 })
  khoanHoanTien?: number;

  @ManyToOne(() => LichHen, (lh) => lh.thanhToans, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'MaLichHen' })
  lichHen?: LichHen;
}
