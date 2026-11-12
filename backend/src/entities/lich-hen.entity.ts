import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { KhachHang } from './khach-hang.entity';
import { KhachSuDungDichVu } from './khach-su-dung-dich-vu.entity';
import { ThanhToan } from './thanh-toan.entity';
import { DanhGia } from './danh-gia.entity';

@Entity({ schema: 'dbo', name: 'lichhen' })
export class LichHen {
  @PrimaryColumn({ name: 'malichhen', type: 'char', length: 10 })
  maLichHen!: string;

  @Column({ name: 'makhachhang', type: 'char', length: 10, nullable: true })
  maKhachHang?: string;

  @Column({ name: 'hotennguoidat', type: 'varchar', length: 50 })
  hoTenNguoiDat!: string;

  @Column({ name: 'sodienthoainguoidat', type: 'char', length: 10 })
  soDienThoaiNguoiDat!: string;

  @Column({ name: 'emailnguoidat', type: 'varchar', length: 100, nullable: true })
  emailNguoiDat?: string;

  @Column({ name: 'ghichu', type: 'varchar', length: 500, nullable: true })
  ghiChu?: string;

  @Column({ name: 'ngayhen', type: 'date' })
  ngayHen!: string;

  @Column({ name: 'giohen', type: 'time' })
  gioHen!: string;

  @Column({ name: 'thoigiandat', type: 'timestamp', precision: 3, default: () => 'dbo.vn_now()' })
  thoiGianDat!: Date;

  @Column({ name: 'trangthailichhen', type: 'varchar', length: 30 })
  trangThaiLichHen!: string;

  @Column({ name: 'trangthaithanhtoan', type: 'varchar', length: 30 })
  trangThaiThanhToan!: string;

  @Column({ name: 'nguondatlich', type: 'varchar', length: 50, nullable: true })
  nguonDatLich?: string;

  @ManyToOne(() => KhachHang, (kh) => kh.lichHens, { nullable: true })
  @JoinColumn({ name: 'makhachhang' })
  khachHang?: KhachHang;

  @OneToMany(() => KhachSuDungDichVu, (ksd) => ksd.lichHen)
  khachSuDungDichVus?: KhachSuDungDichVu[];

  @OneToMany(() => ThanhToan, (tt) => tt.lichHen)
  thanhToans?: ThanhToan[];

  @OneToMany(() => DanhGia, (dg) => dg.lichHen)
  danhGias?: DanhGia[];
}
