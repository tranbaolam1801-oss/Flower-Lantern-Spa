import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { DichVu } from './dich-vu.entity';
import { KhachSuDungDichVu } from './khach-su-dung-dich-vu.entity';

@Entity({ schema: 'dbo', name: 'goidichvu' })
export class GoiDichVu {
  @PrimaryColumn({ name: 'magoi', type: 'char', length: 10 })
  maGoi!: string;

  @Column({ name: 'madichvu', type: 'char', length: 10 })
  maDichVu!: string;

  @Column({ name: 'tengoi', type: 'varchar', length: 100 })
  tenGoi!: string;

  @Column({ name: 'thoiluong', type: 'integer' })
  thoiLuong!: number;

  @Column({ name: 'gia', type: 'numeric', precision: 19, scale: 4 })
  gia!: number;

  @Column({ name: 'trangthai', type: 'varchar', length: 30, default: 'Hoạt động' })
  trangThai!: string;

  @ManyToOne(() => DichVu, (dv) => dv.goiDichVus)
  @JoinColumn({ name: 'madichvu' })
  dichVu?: DichVu;

  @OneToMany(() => KhachSuDungDichVu, (ksd) => ksd.goiDichVu)
  khachSuDungDichVus?: KhachSuDungDichVu[];
}
