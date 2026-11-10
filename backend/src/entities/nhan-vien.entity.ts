import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';
import { PhanHoi } from './phan-hoi.entity';

@Entity({ name: 'NhanVien' })
export class NhanVien {
  @PrimaryColumn({ name: 'MaNhanVien', type: 'char', length: 10 })
  maNhanVien!: string;

  @Column({ name: 'MaTaiKhoan', type: 'char', length: 10, nullable: true })
  maTaiKhoan?: string;

  @Column({ name: 'HoTen', type: 'nvarchar', length: 50 })
  hoTen!: string;

  @Column({ name: 'SoDienThoai', type: 'char', length: 10, unique: true })
  soDienThoai!: string;

  @Column({ name: 'Email', type: 'varchar', length: 100, nullable: true })
  email?: string;

  @Column({ name: 'GioiTinh', type: 'nvarchar', length: 10, nullable: true })
  gioiTinh?: string;

  @Column({ name: 'NgaySinh', type: 'date', nullable: true })
  ngaySinh?: Date;

  @Column({ name: 'DiaChi', type: 'nvarchar', length: 255, nullable: true })
  diaChi?: string;

  @Column({ name: 'GhiChu', type: 'nvarchar', length: 500, nullable: true })
  ghiChu?: string;

  @Column({ name: 'TrangThaiLamViec', type: 'nvarchar', length: 30 })
  trangThaiLamViec!: string;

  @Column({ name: 'TrangThaiHoSo', type: 'nvarchar', length: 30 })
  trangThaiHoSo!: string;

  @ManyToOne(() => TaiKhoan, { nullable: true })
  @JoinColumn({ name: 'MaTaiKhoan' })
  taiKhoan?: TaiKhoan;

  @OneToMany(() => PhanHoi, (ph) => ph.nhanVien)
  phanHois?: PhanHoi[];
}
