import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { LichHen } from './lich-hen.entity';
import { GoiDichVu } from './goi-dich-vu.entity';
import { Giuong } from './giuong.entity';

@Entity({ name: 'KhachSuDungDichVu' })
export class KhachSuDungDichVu {
  @PrimaryColumn({ name: 'MaChiTiet', type: 'char', length: 10 })
  maChiTiet!: string;

  @Column({ name: 'MaLichHen', type: 'char', length: 10 })
  maLichHen!: string;

  @Column({ name: 'MaGoi', type: 'char', length: 10 })
  maGoi!: string;

  @Column({ name: 'MaGiuong', type: 'char', length: 10, nullable: true })
  maGiuong?: string;

  @Column({ name: 'TenKhach', type: 'nvarchar', length: 50 })
  tenKhach!: string;

  @Column({ name: 'SoDienThoai', type: 'char', length: 10, nullable: true })
  soDienThoai?: string;

  @Column({ name: 'ThoiDiemBatDau', type: 'datetime' })
  thoiDiemBatDau!: Date;

  @Column({ name: 'ThoiDiemKetThuc', type: 'datetime' })
  thoiDiemKetThuc!: Date;

  @ManyToOne(() => LichHen, (lh) => lh.khachSuDungDichVus, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'MaLichHen' })
  lichHen?: LichHen;

  @ManyToOne(() => GoiDichVu, (g) => g.khachSuDungDichVus)
  @JoinColumn({ name: 'MaGoi' })
  goiDichVu?: GoiDichVu;

  @ManyToOne(() => Giuong, (g) => g.khachSuDungDichVus, { nullable: true })
  @JoinColumn({ name: 'MaGiuong' })
  giuong?: Giuong;
}
