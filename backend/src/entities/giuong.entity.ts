import { Entity, PrimaryColumn, OneToMany } from 'typeorm';
import { KhachSuDungDichVu } from './khach-su-dung-dich-vu.entity';

@Entity({ name: 'Giuong' })
export class Giuong {
  @PrimaryColumn({ name: 'MaGiuong', type: 'char', length: 10 })
  maGiuong!: string;

  @OneToMany(() => KhachSuDungDichVu, (ksd) => ksd.giuong)
  khachSuDungDichVus?: KhachSuDungDichVu[];
}
