import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { DanhMuc } from './danh-muc.entity';
import { GoiDichVu } from './goi-dich-vu.entity';
import { DanhGia } from './danh-gia.entity';

@Entity({ name: 'DichVu' })
export class DichVu {
  @PrimaryColumn({ name: 'MaDichVu', type: 'char', length: 10 })
  maDichVu!: string;

  @Column({ name: 'MaDanhMuc', type: 'char', length: 10 })
  maDanhMuc!: string;

  @Column({ name: 'TenDichVu', type: 'nvarchar', length: 150, unique: true })
  tenDichVu!: string;

  @Column({ name: 'HinhAnh', type: 'varchar', length: 255, nullable: true })
  hinhAnh?: string;

  @Column({ name: 'MoTaNgan', type: 'nvarchar', length: 255, nullable: true })
  moTaNgan?: string;

  @Column({ name: 'MoTaChiTiet', type: 'nvarchar', length: 'max', nullable: true })
  moTaChiTiet?: string;

  @Column({ name: 'LoiIch', type: 'nvarchar', length: 'max', nullable: true })
  loiIch?: string;

  @Column({ name: 'QuyTrinhThucHien', type: 'nvarchar', length: 'max', nullable: true })
  quyTrinhThucHien?: string;

  @Column({ name: 'DoiTuongPhuHop', type: 'nvarchar', length: 255, nullable: true })
  doiTuongPhuHop?: string;

  @Column({ name: 'ThongTinLieuTrinhVaLuuY', type: 'nvarchar', length: 'max', nullable: true })
  thongTinLieuTrinhVaLuuY?: string;

  @Column({ name: 'TrangThai', type: 'nvarchar', length: 30 })
  trangThai!: string;

  @ManyToOne(() => DanhMuc, (dm) => dm.dichVus)
  @JoinColumn({ name: 'MaDanhMuc' })
  danhMuc?: DanhMuc;

  @OneToMany(() => GoiDichVu, (g) => g.dichVu)
  goiDichVus?: GoiDichVu[];

  @OneToMany(() => DanhGia, (dg) => dg.dichVu)
  danhGias?: DanhGia[];
}
