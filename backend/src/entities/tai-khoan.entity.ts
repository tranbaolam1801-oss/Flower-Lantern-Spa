import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { TaiKhoanQuyen } from './tai-khoan-quyen.entity';

@Entity({ name: 'TaiKhoan' })
export class TaiKhoan {
  @PrimaryColumn({ name: 'MaTaiKhoan', type: 'char', length: 10 })
  maTaiKhoan!: string;

  @Column({ name: 'TenDangNhap', type: 'varchar', length: 50, unique: true })
  tenDangNhap!: string;

  @Column({ name: 'SoDienThoai', type: 'varchar', length: 15, unique: true })
  soDienThoai!: string;

  @Column({ name: 'MatKhauBam', type: 'varchar', length: 255 })
  matKhauBam!: string;

  @Column({ name: 'VaiTro', type: 'nvarchar', length: 30 })
  vaiTro!: string;

  @Column({ name: 'TrangThai', type: 'nvarchar', length: 30 })
  trangThai!: string;

  @OneToMany(() => TaiKhoanQuyen, (tq) => tq.taiKhoan)
  taiKhoanQuyens?: TaiKhoanQuyen[];
}
