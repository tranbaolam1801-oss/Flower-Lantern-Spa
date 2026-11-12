import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { LichHen } from './lich-hen.entity';
import { GoiDichVu } from './goi-dich-vu.entity';
import { Giuong } from './giuong.entity';

@Entity({ schema: 'dbo', name: 'khachsudungdichvu' })
export class KhachSuDungDichVu {
  @PrimaryColumn({ name: 'machitiet', type: 'char', length: 10 })
  maChiTiet!: string;

  @Column({ name: 'malichhen', type: 'char', length: 10 })
  maLichHen!: string;

  @Column({ name: 'magoi', type: 'char', length: 10 })
  maGoi!: string;

  @Column({ name: 'magiuong', type: 'char', length: 10, nullable: true })
  maGiuong?: string;

  @Column({ name: 'tenkhach', type: 'varchar', length: 50 })
  tenKhach!: string;

  @Column({ name: 'sodienthoai', type: 'char', length: 10, nullable: true })
  soDienThoai?: string;

  @Column({ name: 'thoidiembatdau', type: 'timestamp', precision: 3 })
  thoiDiemBatDau!: Date;

  @Column({ name: 'thoidiemketthuc', type: 'timestamp', precision: 3 })
  thoiDiemKetThuc!: Date;

  @ManyToOne(() => LichHen, (lh) => lh.khachSuDungDichVus, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'malichhen' })
  lichHen?: LichHen;

  @ManyToOne(() => GoiDichVu, (g) => g.khachSuDungDichVus)
  @JoinColumn({ name: 'magoi' })
  goiDichVu?: GoiDichVu;

  @ManyToOne(() => Giuong, (g) => g.khachSuDungDichVus, { nullable: true })
  @JoinColumn({ name: 'magiuong' })
  giuong?: Giuong;
}
