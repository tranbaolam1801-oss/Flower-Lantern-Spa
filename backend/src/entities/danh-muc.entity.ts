import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { DichVu } from './dich-vu.entity';

@Entity({ name: 'DanhMuc' })
export class DanhMuc {
  @PrimaryColumn({ name: 'MaDanhMuc', type: 'char', length: 10 })
  maDanhMuc!: string;

  @Column({ name: 'TenDanhMuc', type: 'nvarchar', length: 100 })
  tenDanhMuc!: string;

  @Column({ name: 'TrangThai', type: 'nvarchar', length: 30 })
  trangThai!: string;

  @OneToMany(() => DichVu, (dv) => dv.danhMuc)
  dichVus?: DichVu[];
}
