import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { DanhGia } from './danh-gia.entity';
import { NhanVien } from './nhan-vien.entity';

@Entity({ schema: 'dbo', name: 'phanhoi' })
export class PhanHoi {
  @PrimaryColumn({ name: 'maphanhoi', type: 'char', length: 10 })
  maPhanHoi!: string;

  @Column({ name: 'madanhgia', type: 'char', length: 10, unique: true })
  maDanhGia!: string;

  @Column({ name: 'manhanvien', type: 'char', length: 10 })
  maNhanVien!: string;

  @Column({ name: 'noidungphanhoi', type: 'varchar', length: 1000 })
  noiDungPhanHoi!: string;

  @Column({ name: 'ngayphanhoi', type: 'timestamp', precision: 0, nullable: true })
  ngayPhanHoi?: Date | null;

  @ManyToOne(() => DanhGia, (dg) => dg.phanHois)
  @JoinColumn({ name: 'madanhgia' })
  danhGia?: DanhGia;

  @ManyToOne(() => NhanVien, (nv) => nv.phanHois)
  @JoinColumn({ name: 'manhanvien' })
  nhanVien?: NhanVien;
}
