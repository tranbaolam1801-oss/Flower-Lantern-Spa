import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { DanhMuc } from './danh-muc.entity';
import { GoiDichVu } from './goi-dich-vu.entity';
import { DanhGia } from './danh-gia.entity';

@Entity({ schema: 'dbo', name: 'dichvu' })
export class DichVu {
  @PrimaryColumn({ name: 'madichvu', type: 'char', length: 10 })
  maDichVu!: string;

  @Column({ name: 'madanhmuc', type: 'char', length: 10 })
  maDanhMuc!: string;

  @Column({ name: 'tendichvu', type: 'varchar', length: 150 }) // unique on lower(tendichvu): UX_DichVu_TenDichVu (see database/postgres/001-schema.sql)
  tenDichVu!: string;

  @Column({ name: 'hinhanh', type: 'varchar', length: 255, nullable: true })
  hinhAnh?: string;

  @Column({ name: 'motangan', type: 'varchar', length: 255, nullable: true })
  moTaNgan?: string;

  @Column({ name: 'motachitiet', type: 'text', nullable: true })
  moTaChiTiet?: string;

  @Column({ name: 'loiich', type: 'text', nullable: true })
  loiIch?: string;

  @Column({ name: 'quytrinhthuchien', type: 'text', nullable: true })
  quyTrinhThucHien?: string;

  @Column({ name: 'doituongphuhop', type: 'varchar', length: 255, nullable: true })
  doiTuongPhuHop?: string;

  @Column({ name: 'thongtinlieutrinhvaluuy', type: 'text', nullable: true })
  thongTinLieuTrinhVaLuuY?: string;

  @Column({ name: 'trangthai', type: 'varchar', length: 30 })
  trangThai!: string;

  @ManyToOne(() => DanhMuc, (dm) => dm.dichVus)
  @JoinColumn({ name: 'madanhmuc' })
  danhMuc?: DanhMuc;

  @OneToMany(() => GoiDichVu, (g) => g.dichVu)
  goiDichVus?: GoiDichVu[];

  @OneToMany(() => DanhGia, (dg) => dg.dichVu)
  danhGias?: DanhGia[];
}
