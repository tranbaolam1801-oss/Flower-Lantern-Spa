import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';
import { PhanHoi } from './phan-hoi.entity';

@Entity({ schema: 'dbo', name: 'nhanvien' })
export class NhanVien {
  @PrimaryColumn({ name: 'manhanvien', type: 'char', length: 10 })
  maNhanVien!: string;

  @Column({ name: 'mataikhoan', type: 'char', length: 10, nullable: true })
  maTaiKhoan?: string;

  @Column({ name: 'hoten', type: 'varchar', length: 50 })
  hoTen!: string;

  @Column({ name: 'sodienthoai', type: 'char', length: 10, unique: true })
  soDienThoai!: string;

  @Column({ name: 'email', type: 'varchar', length: 100, nullable: true })
  email?: string;

  @Column({ name: 'gioitinh', type: 'varchar', length: 10, nullable: true })
  gioiTinh?: string;

  @Column({ name: 'ngaysinh', type: 'date', nullable: true })
  ngaySinh?: Date;

  @Column({ name: 'diachi', type: 'varchar', length: 255, nullable: true })
  diaChi?: string;

  @Column({ name: 'ghichu', type: 'varchar', length: 500, nullable: true })
  ghiChu?: string;

  @Column({ name: 'trangthailamviec', type: 'varchar', length: 30 })
  trangThaiLamViec!: string;

  @Column({ name: 'trangthaihoso', type: 'varchar', length: 30 })
  trangThaiHoSo!: string;

  @ManyToOne(() => TaiKhoan, { nullable: true })
  @JoinColumn({ name: 'mataikhoan' })
  taiKhoan?: TaiKhoan;

  @OneToMany(() => PhanHoi, (ph) => ph.nhanVien)
  phanHois?: PhanHoi[];
}
