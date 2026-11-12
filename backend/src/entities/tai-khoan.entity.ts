import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { TaiKhoanQuyen } from './tai-khoan-quyen.entity';

@Entity({ schema: 'dbo', name: 'taikhoan' })
export class TaiKhoan {
  @PrimaryColumn({ name: 'mataikhoan', type: 'char', length: 10 })
  maTaiKhoan!: string;

  @Column({ name: 'tendangnhap', type: 'varchar', length: 50, unique: true })
  tenDangNhap!: string;

  @Column({ name: 'sodienthoai', type: 'varchar', length: 15, unique: true })
  soDienThoai!: string;

  @Column({ name: 'matkhaubam', type: 'varchar', length: 255 })
  matKhauBam!: string;

  @Column({ name: 'vaitro', type: 'varchar', length: 30 })
  vaiTro!: string;

  @Column({ name: 'trangthai', type: 'varchar', length: 30 })
  trangThai!: string;

  @OneToMany(() => TaiKhoanQuyen, (tq) => tq.taiKhoan)
  taiKhoanQuyens?: TaiKhoanQuyen[];
}
