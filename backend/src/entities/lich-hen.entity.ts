import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { KhachHang } from './khach-hang.entity';
import { KhachSuDungDichVu } from './khach-su-dung-dich-vu.entity';
import { ThanhToan } from './thanh-toan.entity';
import { DanhGia } from './danh-gia.entity';

@Entity({ name: 'LichHen' })
export class LichHen {
  @PrimaryColumn({ name: 'MaLichHen', type: 'char', length: 10 })
  maLichHen!: string;

  @Column({ name: 'MaKhachHang', type: 'char', length: 10, nullable: true })
  maKhachHang?: string;

  @Column({ name: 'HoTenNguoiDat', type: 'nvarchar', length: 50 })
  hoTenNguoiDat!: string;

  @Column({ name: 'SoDienThoaiNguoiDat', type: 'char', length: 10 })
  soDienThoaiNguoiDat!: string;

  @Column({ name: 'EmailNguoiDat', type: 'varchar', length: 100, nullable: true })
  emailNguoiDat?: string;

  @Column({ name: 'GhiChu', type: 'nvarchar', length: 500, nullable: true })
  ghiChu?: string;

  @Column({ name: 'NgayHen', type: 'date' })
  ngayHen!: string;

  @Column({ name: 'GioHen', type: 'time' })
  gioHen!: string;

  @Column({ name: 'ThoiGianDat', type: 'datetime', default: () => 'GETDATE()' })
  thoiGianDat!: Date;

  @Column({ name: 'TrangThaiLichHen', type: 'nvarchar', length: 30 })
  trangThaiLichHen!: string;

  @Column({ name: 'TrangThaiThanhToan', type: 'nvarchar', length: 30 })
  trangThaiThanhToan!: string;

  @ManyToOne(() => KhachHang, (kh) => kh.lichHens, { nullable: true })
  @JoinColumn({ name: 'MaKhachHang' })
  khachHang?: KhachHang;

  @OneToMany(() => KhachSuDungDichVu, (ksd) => ksd.lichHen)
  khachSuDungDichVus?: KhachSuDungDichVu[];

  @OneToMany(() => ThanhToan, (tt) => tt.lichHen)
  thanhToans?: ThanhToan[];

  @OneToMany(() => DanhGia, (dg) => dg.lichHen)
  danhGias?: DanhGia[];
}
