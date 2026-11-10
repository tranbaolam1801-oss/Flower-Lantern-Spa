import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';
import { LichHen } from './lich-hen.entity';
import { DanhGia } from './danh-gia.entity';

@Entity({ name: 'KhachHang' })
export class KhachHang {
  @PrimaryColumn({ name: 'MaKhachHang', type: 'char', length: 10 })
  maKhachHang!: string;

  @Column({ name: 'MaTaiKhoan', type: 'char', length: 10, nullable: true })
  maTaiKhoan?: string;

  @Column({ name: 'HoTen', type: 'nvarchar', length: 50 })
  hoTen!: string;

  @Column({ name: 'SoDienThoai', type: 'char', length: 10, unique: true })
  soDienThoai!: string;

  @Column({ name: 'NgaySinh', type: 'date', nullable: true })
  ngaySinh?: Date;

  @Column({ name: 'KenhLienHe', type: 'nvarchar', length: 50, nullable: true })
  kenhLienHe?: string;

  @Column({ name: 'GioiTinh', type: 'nvarchar', length: 10, nullable: true })
  gioiTinh?: string;

  @Column({ name: 'DiaChi', type: 'nvarchar', length: 255, nullable: true })
  diaChi?: string;

  @Column({ name: 'GhiChu', type: 'nvarchar', length: 500, nullable: true })
  ghiChu?: string;

  @Column({ name: 'NgayTao', type: 'datetime', default: () => 'GETDATE()' })
  ngayTao!: Date;

  @ManyToOne(() => TaiKhoan, { nullable: true })
  @JoinColumn({ name: 'MaTaiKhoan' })
  taiKhoan?: TaiKhoan;

  @OneToMany(() => LichHen, (lh) => lh.khachHang)
  lichHens?: LichHen[];

  @OneToMany(() => DanhGia, (dg) => dg.khachHang)
  danhGias?: DanhGia[];
}
