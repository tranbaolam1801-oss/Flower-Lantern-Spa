import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { DichVu } from './dich-vu.entity';

@Entity({ schema: 'dbo', name: 'danhmuc' })
export class DanhMuc {
  @PrimaryColumn({ name: 'madanhmuc', type: 'char', length: 10 })
  maDanhMuc!: string;

  @Column({ name: 'tendanhmuc', type: 'varchar', length: 100 })
  tenDanhMuc!: string;

  @Column({ name: 'trangthai', type: 'varchar', length: 30 })
  trangThai!: string;

  @OneToMany(() => DichVu, (dv) => dv.danhMuc)
  dichVus?: DichVu[];
}
