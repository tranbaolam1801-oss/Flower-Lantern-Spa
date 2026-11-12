import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { LichHen } from './lich-hen.entity';

@Entity({ schema: 'dbo', name: 'thanhtoan' })
export class ThanhToan {
  @PrimaryColumn({ name: 'mathanhtoan', type: 'char', length: 10 })
  maThanhToan!: string;

  @Column({ name: 'malichhen', type: 'char', length: 10 })
  maLichHen!: string;

  @Column({ name: 'sotienthanhtoan', type: 'numeric', precision: 19, scale: 4 })
  soTienThanhToan!: number;

  @Column({ name: 'ngayghinhan', type: 'timestamp', precision: 3 })
  ngayGhiNhan!: Date;

  @Column({ name: 'trangthaigiaodich', type: 'varchar', length: 30 })
  trangThaiGiaoDich!: string;

  @Column({ name: 'khoanhoantien', type: 'numeric', precision: 19, scale: 4, nullable: true, default: 0 })
  khoanHoanTien?: number;

  @Column({ name: 'mathamchieu', type: 'varchar', length: 32, nullable: true })
  maThamChieu?: string;

  @Column({ name: 'nhacungcap', type: 'varchar', length: 20, nullable: true })
  nhaCungCap?: string;

  @Column({ name: 'magiaodichnhacungcap', type: 'varchar', length: 64, nullable: true })
  maGiaoDichNhaCungCap?: string;

  @Column({ name: 'hanthanhtoan', type: 'timestamp', precision: 3, nullable: true })
  hanThanhToan?: Date;

  @Column({ name: 'sotaikhoannhan', type: 'varchar', length: 30, nullable: true })
  soTaiKhoanNhan?: string;

  @ManyToOne(() => LichHen, (lh) => lh.thanhToans, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'malichhen' })
  lichHen?: LichHen;
}
