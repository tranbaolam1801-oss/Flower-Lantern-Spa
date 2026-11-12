import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';
import { LichHen } from './lich-hen.entity';
import { DanhGia } from './danh-gia.entity';

@Entity({ schema: 'dbo', name: 'khachhang' })
export class KhachHang {
  @PrimaryColumn({ name: 'makhachhang', type: 'char', length: 10 })
  maKhachHang!: string;

  @Column({ name: 'mataikhoan', type: 'char', length: 10, nullable: true })
  maTaiKhoan?: string;

  @Column({ name: 'hoten', type: 'varchar', length: 50 })
  hoTen!: string;

  @Column({ name: 'sodienthoai', type: 'char', length: 10, unique: true })
  soDienThoai!: string;

  @Column({ name: 'ngaysinh', type: 'date', nullable: true })
  ngaySinh?: Date;

  @Column({ name: 'kenhlienhe', type: 'varchar', length: 50, nullable: true })
  kenhLienHe?: string;

  @Column({ name: 'gioitinh', type: 'varchar', length: 10, nullable: true })
  gioiTinh?: string;

  @Column({ name: 'diachi', type: 'varchar', length: 255, nullable: true })
  diaChi?: string;

  @Column({ name: 'ghichu', type: 'varchar', length: 500, nullable: true })
  ghiChu?: string;

  @Column({ name: 'ngaytao', type: 'timestamp', precision: 3, default: () => 'dbo.vn_now()' })
  ngayTao!: Date;

  @ManyToOne(() => TaiKhoan, { nullable: true })
  @JoinColumn({ name: 'mataikhoan' })
  taiKhoan?: TaiKhoan;

  @OneToMany(() => LichHen, (lh) => lh.khachHang)
  lichHens?: LichHen[];

  @OneToMany(() => DanhGia, (dg) => dg.khachHang)
  danhGias?: DanhGia[];
}
