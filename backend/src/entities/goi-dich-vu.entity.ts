import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { DichVu } from './dich-vu.entity';
import { KhachSuDungDichVu } from './khach-su-dung-dich-vu.entity';

@Entity({ name: 'GoiDichVu' })
export class GoiDichVu {
  @PrimaryColumn({ name: 'MaGoi', type: 'char', length: 10 })
  maGoi!: string;

  @Column({ name: 'MaDichVu', type: 'char', length: 10 })
  maDichVu!: string;

  @Column({ name: 'TenGoi', type: 'nvarchar', length: 100 })
  tenGoi!: string;

  @Column({ name: 'ThoiLuong', type: 'int' })
  thoiLuong!: number;

  @Column({ name: 'Gia', type: 'money' })
  gia!: number;

  @ManyToOne(() => DichVu, (dv) => dv.goiDichVus)
  @JoinColumn({ name: 'MaDichVu' })
  dichVu?: DichVu;

  @OneToMany(() => KhachSuDungDichVu, (ksd) => ksd.goiDichVu)
  khachSuDungDichVus?: KhachSuDungDichVu[];
}
