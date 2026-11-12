import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { LichHen } from './lich-hen.entity';
import { KhachHang } from './khach-hang.entity';
import { DichVu } from './dich-vu.entity';
import { PhanHoi } from './phan-hoi.entity';

@Entity({ schema: 'dbo', name: 'danhgia' })
export class DanhGia {
  @PrimaryColumn({ name: 'madanhgia', type: 'char', length: 10 })
  maDanhGia!: string;

  @Column({ name: 'malichhen', type: 'char', length: 10, unique: true })
  maLichHen!: string;

  @Column({ name: 'makhachhang', type: 'char', length: 10 })
  maKhachHang!: string;

  @Column({ name: 'madichvu', type: 'char', length: 10 })
  maDichVu!: string;

  @Column({ name: 'sosao', type: 'smallint' })
  soSao!: number;

  @Column({ name: 'noidungdanhgia', type: 'varchar', length: 1000, nullable: true })
  noiDungDanhGia?: string;

  @Column({ name: 'ngaydanhgia', type: 'timestamp', precision: 3, default: () => 'dbo.vn_now()' })
  ngayDanhGia!: Date;

  @ManyToOne(() => LichHen, (lh) => lh.danhGias)
  @JoinColumn({ name: 'malichhen' })
  lichHen?: LichHen;

  @ManyToOne(() => KhachHang, (kh) => kh.danhGias)
  @JoinColumn({ name: 'makhachhang' })
  khachHang?: KhachHang;

  @ManyToOne(() => DichVu, (dv) => dv.danhGias)
  @JoinColumn({ name: 'madichvu' })
  dichVu?: DichVu;

  @OneToMany(() => PhanHoi, (ph) => ph.danhGia)
  phanHois?: PhanHoi[];
}
